<?php

function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    $allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4173',
        'https://admin.taghunter.fr',
        'http://admin.taghunter.fr'
    ];

    $isDevelopment = !empty($origin) && (
        strpos($origin, 'localhost') !== false ||
        strpos($origin, 'taghunter.fr') !== false ||
        strpos($origin, 'webcontainer') !== false ||
        strpos($origin, '127.0.0.1') !== false ||
        strpos($origin, 'stackblitz') !== false ||
        strpos($origin, 'gitpod') !== false ||
        strpos($origin, 'codesandbox') !== false
    );

    if (in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } elseif ($isDevelopment) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        header("Access-Control-Allow-Origin: *");
        header("Access-Control-Allow-Credentials: false");
    }

    header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-Requested-With");
    header("Access-Control-Max-Age: 3600");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}
