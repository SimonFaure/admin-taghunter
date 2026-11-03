<?php
/**
 * Mailjet Send API v3.1 over curl (no SDK). Used by EventsEmails.
 * Not configured (no keys) -> returns ['ok' => false, 'error' => 'mailjet_not_configured'];
 * on Windows dev the message is also written to backend/storage/mail_preview/
 * so it can be opened in a browser.
 */
require_once __DIR__ . '/PaymentsConfig.php';

class Mailer {
    public static function configured(): bool {
        return PaymentsConfig::get('mailjet_api_key') !== '' && PaymentsConfig::get('mailjet_api_secret') !== '';
    }

    /**
     * @param array $m [
     *   'to' => email, 'to_name' => ?, 'subject', 'html', 'text',
     *   'from_name' => display name (address is config mail_from_email),
     *   'reply_to' => ?email, 'reply_to_name' => ?,
     *   'attachments' => [['filename','content_type','content'(raw)]],
     *   'inline' => [['filename','content_type','content'(raw),'cid']],
     *   'custom_id' => ?string ]
     * @return array ['ok' => bool, 'message_id' => ?string, 'error' => ?string]
     */
    public static function send(array $m): array {
        $from = (string)PaymentsConfig::get('mail_from_email', 'billetterie@taghunter.fr');
        $msg = [
            'From' => ['Email' => $from, 'Name' => mb_substr($m['from_name'] ?? 'Tag Hunter', 0, 80)],
            'To' => [array_filter(['Email' => $m['to'], 'Name' => $m['to_name'] ?? null])],
            'Subject' => $m['subject'],
            'TextPart' => $m['text'] ?? strip_tags($m['html']),
            'HTMLPart' => $m['html'],
        ];
        if (!empty($m['reply_to'])) $msg['ReplyTo'] = array_filter(['Email' => $m['reply_to'], 'Name' => $m['reply_to_name'] ?? null]);
        if (!empty($m['custom_id'])) $msg['CustomID'] = substr($m['custom_id'], 0, 64);
        foreach ($m['attachments'] ?? [] as $a) {
            $msg['Attachments'][] = ['ContentType' => $a['content_type'], 'Filename' => $a['filename'], 'Base64Content' => base64_encode($a['content'])];
        }
        foreach ($m['inline'] ?? [] as $a) {
            $msg['InlinedAttachments'][] = [
                'ContentType' => $a['content_type'], 'Filename' => $a['filename'],
                'ContentID' => $a['cid'], 'Base64Content' => base64_encode($a['content']),
            ];
        }

        if (!self::configured()) {
            self::preview($m);
            return ['ok' => false, 'message_id' => null, 'error' => 'mailjet_not_configured'];
        }

        $body = ['Messages' => [$msg]];
        if (PaymentsConfig::get('mailjet_sandbox', false)) $body['SandboxMode'] = true;

        $ch = curl_init('https://api.mailjet.com/v3.1/send');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERPWD => PaymentsConfig::get('mailjet_api_key') . ':' . PaymentsConfig::get('mailjet_api_secret'),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode($body),
        ]);
        $res = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        if ($res === false) return ['ok' => false, 'message_id' => null, 'error' => 'curl: ' . $err];
        $json = json_decode($res, true);
        $first = $json['Messages'][0] ?? null;
        if ($code >= 200 && $code < 300 && ($first['Status'] ?? '') === 'success') {
            return ['ok' => true, 'message_id' => (string)($first['To'][0]['MessageID'] ?? ''), 'error' => null];
        }
        return ['ok' => false, 'message_id' => null, 'error' => "HTTP $code " . mb_substr((string)$res, 0, 500)];
    }

    /** Dev aid: drop the rendered email next to the backend (git-ignored storage/). */
    private static function preview(array $m): void {
        if (stripos(PHP_OS, 'WIN') !== 0) return;
        $dir = __DIR__ . '/../storage/mail_preview';
        if (!is_dir($dir)) @mkdir($dir, 0775, true);
        $html = $m['html'];
        foreach ($m['inline'] ?? [] as $a) {
            $html = str_replace('cid:' . $a['cid'], 'data:' . $a['content_type'] . ';base64,' . base64_encode($a['content']), $html);
        }
        $name = gmdate('Ymd-His') . '-' . preg_replace('/[^a-z0-9]+/i', '-', $m['custom_id'] ?? 'mail') . '.html';
        @file_put_contents("$dir/$name", "<!-- To: {$m['to']} | Subject: " . htmlspecialchars($m['subject']) . " -->\n" . $html);
    }
}
