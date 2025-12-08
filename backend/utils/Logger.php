<?php

require_once __DIR__ . '/../database/Database.php';

class Logger {
    private static $lastError = null;

    public static function log($endpoint, $method, $action, $userId = null, $data = [], $response = null, $statusCode = 200) {
        try {
            $db = Database::getInstance();

            $sql = "INSERT INTO api_logs (endpoint, method, action, user_id, ip, user_agent, request_data, response_data, status_code)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

            $params = [
                $endpoint,
                $method,
                $action,
                $userId,
                $_SERVER['REMOTE_ADDR'] ?? 'unknown',
                $_SERVER['HTTP_USER_AGENT'] ?? 'unknown',
                !empty($data) ? json_encode($data) : null,
                $response ? json_encode($response) : null,
                $statusCode
            ];

            $db->execute($sql, $params);
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
            'storage_type' => 'mysql',
            'last_error' => self::$lastError
        ];
    }

    public static function getLogs($limit = 100, $offset = 0) {
        try {
            $db = Database::getInstance();
            $sql = "SELECT
                        id,
                        timestamp,
                        endpoint,
                        method,
                        action,
                        user_id,
                        ip,
                        user_agent,
                        request_data,
                        response_data,
                        status_code,
                        created_at
                    FROM api_logs
                    ORDER BY timestamp DESC
                    LIMIT ? OFFSET ?";

            $logs = $db->fetchAll($sql, [$limit, $offset]) ?: [];

            // Parse JSON fields and rename for frontend
            return array_map(function($log) {
                return [
                    'id' => $log['id'],
                    'timestamp' => $log['timestamp'],
                    'endpoint' => $log['endpoint'],
                    'method' => $log['method'],
                    'action' => $log['action'],
                    'user_id' => $log['user_id'],
                    'ip' => $log['ip'],
                    'user_agent' => $log['user_agent'],
                    'data' => $log['request_data'] ? json_decode($log['request_data'], true) : null,
                    'response' => $log['response_data'] ? json_decode($log['response_data'], true) : null,
                    'status_code' => $log['status_code'],
                    'created_at' => $log['created_at']
                ];
            }, $logs);
        } catch (Exception $e) {
            self::$lastError = $e->getMessage();
            error_log("Logger getLogs error: " . $e->getMessage());
            return [];
        }
    }

    public static function clearLogs() {
        try {
            $db = Database::getInstance();
            $db->execute("DELETE FROM api_logs");
        } catch (Exception $e) {
            self::$lastError = $e->getMessage();
            error_log("Logger clearLogs error: " . $e->getMessage());
        }
    }

    public static function getLogCount() {
        try {
            $db = Database::getInstance();
            $result = $db->fetch("SELECT COUNT(*) as count FROM api_logs");
            return $result ? (int)$result['count'] : 0;
        } catch (Exception $e) {
            self::$lastError = $e->getMessage();
            error_log("Logger getLogCount error: " . $e->getMessage());
            return 0;
        }
    }
}
