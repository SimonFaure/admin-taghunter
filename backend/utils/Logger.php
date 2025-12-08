<?php

class Logger {
    private static $lastError = null;
    private static $supabaseUrl = 'https://gaolbjmyiitbdbbszteg.supabase.co';
    private static $supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdhb2xiam15aWl0YmRiYnN6dGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxMDEwNzYsImV4cCI6MjA3ODY3NzA3Nn0.-RzOhEnJPl2LQe9gwuClF8m3f1MGAQ95-kar-d5x8xM';

    public static function log($endpoint, $method, $action, $userId = null, $data = [], $response = null, $statusCode = 200) {
        try {
            $logEntry = [
                'endpoint' => $endpoint,
                'method' => $method,
                'action' => $action,
                'user_id' => $userId,
                'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
                'request_data' => !empty($data) ? $data : null,
                'response_data' => $response,
                'status_code' => $statusCode
            ];

            $ch = curl_init(self::$supabaseUrl . '/rest/v1/api_logs');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'apikey: ' . self::$supabaseKey,
                'Authorization: Bearer ' . self::$supabaseKey,
                'Prefer: return=minimal'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($logEntry));
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);

            $result = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($curlError) {
                self::$lastError = "cURL error: $curlError";
                error_log("Logger: cURL error - $curlError");
                return false;
            }

            if ($httpCode < 200 || $httpCode >= 300) {
                self::$lastError = "HTTP $httpCode: $result";
                error_log("Logger: HTTP $httpCode - $result");
                return false;
            }

            self::$lastError = null;
            return true;
        } catch (Exception $e) {
            self::$lastError = $e->getMessage();
            error_log("Logger exception: " . $e->getMessage());
            return false;
        }
    }

    public static function getLastError() {
        return self::$lastError;
    }

    public static function checkPermissions() {
        return [
            'storage_type' => 'supabase',
            'supabase_url' => self::$supabaseUrl,
            'last_error' => self::$lastError
        ];
    }

    public static function getLogs($limit = 100, $offset = 0) {
        try {
            $url = self::$supabaseUrl . '/rest/v1/api_logs?order=timestamp.desc&limit=' . $limit . '&offset=' . $offset;

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'apikey: ' . self::$supabaseKey,
                'Authorization: Bearer ' . self::$supabaseKey
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $result = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode === 200) {
                return json_decode($result, true) ?: [];
            }

            return [];
        } catch (Exception $e) {
            error_log("Logger getLogs error: " . $e->getMessage());
            return [];
        }
    }

    public static function clearLogs() {
        try {
            $ch = curl_init(self::$supabaseUrl . '/rest/v1/api_logs');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'apikey: ' . self::$supabaseKey,
                'Authorization: Bearer ' . self::$supabaseKey,
                'Prefer: return=minimal'
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            curl_exec($ch);
            curl_close($ch);
        } catch (Exception $e) {
            error_log("Logger clearLogs error: " . $e->getMessage());
        }
    }

    public static function getLogCount() {
        try {
            $url = self::$supabaseUrl . '/rest/v1/api_logs?select=count';

            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'apikey: ' . self::$supabaseKey,
                'Authorization: Bearer ' . self::$supabaseKey,
                'Prefer: count=exact'
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);

            $result = curl_exec($ch);
            $headers = curl_getinfo($ch, CURLINFO_HEADER_OUT);
            curl_close($ch);

            $count = 0;
            if (preg_match('/content-range: \d+-\d+\/(\d+)/i', $headers, $matches)) {
                $count = (int)$matches[1];
            }

            return $count;
        } catch (Exception $e) {
            error_log("Logger getLogCount error: " . $e->getMessage());
            return 0;
        }
    }
}
