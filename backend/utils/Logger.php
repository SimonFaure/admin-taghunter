<?php

class Logger {
    private static $logFile = __DIR__ . '/../../logs/api.log';

    public static function log($endpoint, $method, $action, $userId = null, $data = [], $response = null, $statusCode = 200) {
        $logDir = dirname(self::$logFile);
        if (!is_dir($logDir)) {
            mkdir($logDir, 0755, true);
        }

        $logEntry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'endpoint' => $endpoint,
            'method' => $method,
            'action' => $action,
            'user_id' => $userId,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
            'data' => $data,
            'response' => $response,
            'status_code' => $statusCode
        ];

        $logLine = json_encode($logEntry) . PHP_EOL;
        file_put_contents(self::$logFile, $logLine, FILE_APPEND | LOCK_EX);
    }

    public static function getLogs($limit = 100, $offset = 0) {
        if (!file_exists(self::$logFile)) {
            return [];
        }

        $lines = file(self::$logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!$lines) {
            return [];
        }

        $lines = array_reverse($lines);
        $lines = array_slice($lines, $offset, $limit);

        $logs = [];
        foreach ($lines as $line) {
            $decoded = json_decode($line, true);
            if ($decoded) {
                $logs[] = $decoded;
            }
        }

        return $logs;
    }

    public static function clearLogs() {
        if (file_exists(self::$logFile)) {
            unlink(self::$logFile);
        }
    }

    public static function getLogCount() {
        if (!file_exists(self::$logFile)) {
            return 0;
        }

        $lines = file(self::$logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        return $lines ? count($lines) : 0;
    }
}
