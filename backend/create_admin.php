<?php

require_once __DIR__ . '/database/Database.php';

// Configuration
$email = 'admin@taghunter.fr';
$password = 'admin123';
$name = 'Admin User';

try {
    $db = Database::getInstance();

    // Hash the password
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    echo "Creating admin user...\n";
    echo "Email: {$email}\n";
    echo "Password: {$password}\n";
    echo "Hash: {$hashedPassword}\n\n";

    // Check if user exists
    $existing = $db->fetch(
        'SELECT id FROM admin_users WHERE email = ?',
        [$email]
    );

    if ($existing) {
        // Update existing user
        $db->query(
            'UPDATE admin_users SET password = ?, name = ? WHERE email = ?',
            [$hashedPassword, $name, $email]
        );
        echo "✓ Admin user updated successfully!\n";
    } else {
        // Insert new user
        $db->query(
            'INSERT INTO admin_users (email, password, name) VALUES (?, ?, ?)',
            [$email, $hashedPassword, $name]
        );
        echo "✓ Admin user created successfully!\n";
    }

    echo "\nYou can now login with:\n";
    echo "Email: {$email}\n";
    echo "Password: {$password}\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}
