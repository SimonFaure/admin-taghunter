# Taghunter Product Scenarios

This document explains how scenarios are categorized as either **Taghunter Products** or **Custom Client Scenarios**.

## Overview

When a scenario is created through the Taghunter Creator app, the system determines whether it should be classified as a Taghunter Product or a Custom Client Scenario based on the email address provided in the request.

## Classification Logic

### Taghunter Product Scenarios
- **Definition**: Official scenarios created by Taghunter administrators
- **Database**: `client_id` is `NULL` in the `scenarios` table
- **Created by**: Users with admin email addresses (exist in `admin_users` table)
- **Purpose**: Reusable, official game scenarios available to all clients

### Custom Client Scenarios
- **Definition**: Scenarios created by individual clients
- **Database**: `client_id` references the specific client in the `scenarios` table
- **Created by**: Users with client email addresses (exist in `clients` table)
- **Purpose**: Client-specific scenarios for their own use

## Implementation

### Scenario Creation Flow

When a scenario is created via `scenarios.php?action=create`:

1. **Email Check**: The system checks if the provided email exists in `admin_users` table
   ```php
   $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
   ```

2. **Admin Email**: If found, `client_id` is set to `NULL` (Taghunter Product)
   ```php
   if ($admin) {
       $client_id = null; // Taghunter Product
   }
   ```

3. **Client Email**: If not an admin, look up the client
   ```php
   else {
       $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);
       if ($client) {
           $client_id = (int)$client['id']; // Custom Client Scenario
       }
   }
   ```

### Response Data

The API response includes an `is_taghunter_product` flag for easy identification:

```json
{
  "success": true,
  "data": {
    "id": 123,
    "client_id": null,
    "is_taghunter_product": true,
    "title": "Treasure Hunt Adventure",
    "description": "An exciting treasure hunt scenario",
    "uniqid": "abc123",
    ...
  },
  "message": "Scenario created successfully"
}
```

### Logging

All scenario creation is logged with the `is_taghunter_product` flag:

```php
Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, [
    'client_id' => $client_id,
    'is_taghunter_product' => $client_id === null,
    'email' => $email,
    'title' => $title,
    'uniqid' => $uniqid
], $responseData, 201, 'creator');
```

## Benefits

1. **Clear Separation**: Official products are easily distinguishable from client-specific content
2. **Reusability**: Taghunter Products can be referenced by multiple clients
3. **Organization**: Simplifies content management and filtering
4. **Visibility**: Logs clearly show which scenarios are products vs custom

## Database Schema

The `scenarios` table stores both types:

```sql
CREATE TABLE scenarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NULL,  -- NULL = Taghunter Product, INT = Custom Client Scenario
  title VARCHAR(255) NOT NULL,
  description TEXT,
  uniqid VARCHAR(50) UNIQUE NOT NULL,
  ...
  FOREIGN KEY (client_id) REFERENCES clients(id)
);
```

## Usage in Frontend

To check if a scenario is a Taghunter Product:

```javascript
if (scenario.is_taghunter_product || scenario.client_id === null) {
  // This is a Taghunter Product
} else {
  // This is a Custom Client Scenario
}
```

## Testing

To test the classification:

1. Create a scenario with an admin email address
   - Verify `client_id` is `NULL` in database
   - Verify `is_taghunter_product` is `true` in response

2. Create a scenario with a client email address
   - Verify `client_id` matches the client's ID
   - Verify `is_taghunter_product` is `false` in response

3. Check the logs to see the classification is recorded correctly
