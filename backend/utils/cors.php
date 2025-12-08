<?php

function setCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';

    // Allow specific origins or all origins during development
    $allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:4173',
        'https://admin.taghunter.fr'
    ];

    if (in_array($origin, $allowedOrigins)) {
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    } else {
        // Fallback for other origins - allow but without credentials
        header("Access-Control-Allow-Origin: $origin");
        header("Access-Control-Allow-Credentials: true");
    }

    header("Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization");
    header("Access-Control-Max-Age: 3600");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
}
