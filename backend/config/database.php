<?php

// Local dev runs on Laragon (Windows) with the MySQL root account and no
// password. Production is a Linux host using dedicated credentials. Detecting
// by OS family lets a single file work in both places, so the FTP deploy can
// ship this file without clobbering the local setup.
$isWindows = stripos(PHP_OS, 'WIN') === 0;

return $isWindows
    ? [
        // Local dev (Laragon).
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'dbtwycfsreck0w',
        'username' => 'root',
        'password' => '',
        'charset' => 'utf8mb4',
    ]
    : [
        // Production.
        'host' => '127.0.0.1',
        'port' => 3306,
        'database' => 'dbtwycfsreck0w',
        'username' => 'u0vswg9avwvro',
        'password' => 'bntce327tups',
        'charset' => 'utf8mb4',
    ];
