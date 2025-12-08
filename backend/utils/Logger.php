<?php

class Logger {
    private static $logFile = __DIR__ . '/../../logs/api.log';
    private static $lastError = null;

    public static function log($endpoint, $method, $action, $userId = null, $data = [], $response = null, $statusCode = 200) {
        try {
            $logDir = dirname(self::$logFile);

            if (!is_dir($logDir)) {
                if (!mkdir($logDir, 0755, true)) {
                    self::$lastError = "Failed to create log directory: $logDir";
                    error_log("Logger: Failed to create directory $logDir");
                    return false;
                }
            }

            if (!is_writable($logDir)) {
                self::$lastError = "Log directory is not writable: $logDir";
                error_log("Logger: Directory $logDir is not writable");
                return false;
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

            if (file_put_contents(self::$logFile, $logLine, FILE_APPEND | LOCK_EX) === false) {
                self::$lastError = "Failed to write to log file: " . self::$logFile;
                error_log("Logger: Failed to write to " . self::$logFile);
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

    public static function getLogPath() {
        return self::$logFile;
    }

    public static function checkPermissions() {
        $logDir = dirname(self::$logFile);
        return [
            'log_path' => self::$logFile,
            'log_dir' => $logDir,
            'dir_exists' => is_dir($logDir),
            'dir_writable' => is_dir($logDir) && is_writable($logDir),
            'file_exists' => file_exists(self::$logFile),
            'file_writable' => file_exists(self::$logFile) ? is_writable(self::$logFile) : null,
            'last_error' => self::$lastError
        ];
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
