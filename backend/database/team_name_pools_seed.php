<?php
// Seed the GLOBAL team-name catalog with 50 fun names per audience
// (mini_kids / kids / ado_adultes) × language (fr, en) = 300 names.
//
// Idempotent: skips names already present for a (audience, language) scope
// (case-insensitive), so re-running only fills gaps. Bumps the global pool
// version by 0.10 once if anything was inserted, so playgrounds re-sync.
//
// Run from CLI:  php backend/database/team_name_pools_seed.php

require_once __DIR__ . '/Database.php';

$db = Database::getInstance();

// Ensure tables exist (matches team_name_pools.php / migration; DECIMAL version).
$db->query("
    CREATE TABLE IF NOT EXISTS team_name_pools (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        client_id INT NULL DEFAULT NULL,
        audience ENUM('mini_kids','kids','ado_adultes') NOT NULL,
        language VARCHAR(5) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_scope (client_id, audience, language)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");
$db->query("
    CREATE TABLE IF NOT EXISTS team_name_pools_meta (
        scope_key VARCHAR(64) PRIMARY KEY,
        current_version DECIMAL(10,2) NOT NULL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
");

// One-time self-healing for an instance whose table predates the canonical
// taxonomy / decimal version (e.g. created by the modal during early testing).
// Widen the ENUM, fold legacy values onto the trio, then narrow it; upgrade the
// version column to DECIMAL. All no-ops once the schema is already canonical.
$audCol = $db->fetch("SHOW COLUMNS FROM team_name_pools LIKE 'audience'");
$audType = strtolower($audCol['Type'] ?? '');
if (strpos($audType, 'mini_kids') === false || strpos($audType, 'teens') !== false || strpos($audType, "'adults'") !== false) {
    $db->query("ALTER TABLE team_name_pools MODIFY audience ENUM('mini_kids','kids','teens','adults','ado_adultes') NOT NULL");
    $db->query("UPDATE team_name_pools SET audience = 'ado_adultes' WHERE audience IN ('teens', 'adults')");
    $db->query("ALTER TABLE team_name_pools MODIFY audience ENUM('mini_kids','kids','ado_adultes') NOT NULL");
}
$verCol = $db->fetch("SHOW COLUMNS FROM team_name_pools_meta LIKE 'current_version'");
if (stripos($verCol['Type'] ?? '', 'decimal') === false) {
    $db->query("ALTER TABLE team_name_pools_meta MODIFY current_version DECIMAL(10,2) NOT NULL DEFAULT 0");
}

$pools = [
    'mini_kids' => [
        'en' => [
            'Little Lions', 'Baby Bears', 'Tiny Tigers', 'Happy Ducks', 'Sunny Bunnies',
            'Baby Pandas', 'Little Stars', 'Sleepy Sheep', 'Jumping Frogs', 'Baby Elephants',
            'Cuddly Cats', 'Tiny Turtles', 'Little Ladybugs', 'Baby Penguins', 'Fluffy Chicks',
            'Smiley Snails', 'Little Foxes', 'Baby Owls', 'Happy Hedgehogs', 'Tiny Mice',
            'Rainbow Fish', 'Little Puppies', 'Baby Koalas', 'Bouncy Bunnies', 'Sweet Bees',
            'Little Lambs', 'Baby Dolphins', 'Tiny Kittens', 'Giggly Geese', 'Little Monkeys',
            'Baby Seals', 'Happy Hippos', 'Tiny Toads', 'Little Crabs', 'Baby Giraffes',
            'Sunny Squirrels', 'Little Robins', 'Baby Zebras', 'Cuddly Cubs', 'Tiny Ponies',
            'Little Doves', 'Baby Otters', 'Happy Hens', 'Tiny Tadpoles', 'Little Deer',
            'Baby Llamas', 'Sweet Swans', 'Little Beavers', 'Baby Raccoons', 'Tiny Turtledoves',
        ],
        'fr' => [
            'Les Petits Lions', 'Les Oursons', 'Les Petits Tigres', 'Les Canards Rigolos', 'Les Lapins du Soleil',
            'Les Bébés Pandas', 'Les Petites Étoiles', 'Les Moutons Câlins', 'Les Grenouilles Sauteuses', 'Les Bébés Éléphants',
            'Les Petits Chats', 'Les Petites Tortues', 'Les Coccinelles', 'Les Bébés Pingouins', 'Les Poussins',
            'Les Escargots Rigolos', 'Les Petits Renards', 'Les Bébés Hiboux', 'Les Petits Hérissons', 'Les Petites Souris',
            'Les Poissons Arc-en-ciel', 'Les Petits Chiots', 'Les Bébés Koalas', 'Les Lapins Sauteurs', 'Les Petites Abeilles',
            'Les Agneaux', 'Les Bébés Dauphins', 'Les Petits Chatons', 'Les Oies Rigolotes', 'Les Petits Singes',
            'Les Bébés Phoques', 'Les Hippos Joyeux', 'Les Petits Crapauds', 'Les Petits Crabes', 'Les Bébés Girafes',
            'Les Petits Écureuils', 'Les Petits Rouges-gorges', 'Les Bébés Zèbres', 'Les Petits Nounours', 'Les Petits Poneys',
            'Les Petites Colombes', 'Les Bébés Loutres', 'Les Petites Poules', 'Les Têtards', 'Les Petits Cerfs',
            'Les Bébés Lamas', 'Les Cygnes', 'Les Petits Castors', 'Les Bébés Ratons', 'Les Petites Tourterelles',
        ],
    ],
    'kids' => [
        'en' => [
            'Thunder Tigers', 'Rocket Rangers', 'Lightning Lions', 'Fire Dragons', 'Storm Chasers',
            'Shadow Ninjas', 'Galaxy Guardians', 'Power Pandas', 'Wild Wolves', 'Speed Demons',
            'Ice Warriors', 'Jungle Kings', 'Cyber Sharks', 'Phoenix Squad', 'Cosmic Crew',
            'Mega Monkeys', 'Turbo Turtles', 'Laser Hawks', 'Volcano Vipers', 'Ghost Riders',
            'Steel Eagles', 'Solar Foxes', 'Midnight Bats', 'Diamond Dogs', 'Rampaging Rhinos',
            'Star Strikers', 'Dino Squad', 'Comet Crushers', 'Frost Giants', 'Blaze Brigade',
            'Atomic Aces', 'Jungle Jaguars', 'Tornado Team', 'Electric Eels', 'Savage Sharks',
            'Rocket Raccoons', 'Thunderbolts', 'Wild Cards', 'Stealth Foxes', 'Magma Monsters',
            'Sky Pirates', 'Quantum Kids', 'Lava Lizards', 'Night Owls', 'Storm Hawks',
            'Crimson Cobras', 'Galaxy Goats', 'Rebel Rangers', 'Mighty Moose', 'Falcon Force',
        ],
        'fr' => [
            'Les Tigres Tonnerre', 'Les Rangers Fusée', 'Les Lions Éclair', 'Les Dragons de Feu', 'Les Chasseurs de Tempête',
            'Les Ninjas de l\'Ombre', 'Les Gardiens de la Galaxie', 'Les Pandas Puissants', 'Les Loups Sauvages', 'Les Bolides',
            'Les Guerriers de Glace', 'Les Rois de la Jungle', 'Les Requins Cyber', 'L\'Escouade Phénix', 'L\'Équipe Cosmique',
            'Les Méga Singes', 'Les Tortues Turbo', 'Les Faucons Laser', 'Les Vipères du Volcan', 'Les Cavaliers Fantômes',
            'Les Aigles d\'Acier', 'Les Renards Solaires', 'Les Chauves-souris de Minuit', 'Les Chiens de Diamant', 'Les Rhinos Furieux',
            'Les Attaquants des Étoiles', 'L\'Escouade Dino', 'Les Briseurs de Comètes', 'Les Géants de Givre', 'La Brigade des Flammes',
            'Les As Atomiques', 'Les Jaguars de la Jungle', 'L\'Équipe Tornade', 'Les Anguilles Électriques', 'Les Requins Sauvages',
            'Les Ratons Fusée', 'Les Éclairs', 'Les Cartes Sauvages', 'Les Renards Furtifs', 'Les Monstres de Magma',
            'Les Pirates du Ciel', 'Les Enfants Quantiques', 'Les Lézards de Lave', 'Les Hiboux de Nuit', 'Les Faucons de Tempête',
            'Les Cobras Cramoisis', 'Les Chèvres de la Galaxie', 'Les Rangers Rebelles', 'Les Élans Puissants', 'La Force Faucon',
        ],
    ],
    'ado_adultes' => [
        'en' => [
            'The Brainiacs', 'Quiz Khalifa', 'The Masterminds', 'Sherlock Homies', 'The Underdogs',
            'Smarty Pants', 'The Quizzards', 'Risky Business', 'The Avengers', 'No Idea',
            'The Wolfpack', 'The Renegades', 'Trivia Newton John', 'The Outliers', 'Game of Phones',
            'The Misfits', 'Les Quizerables', 'The Dream Team', 'The Rebels', 'Witty Committee',
            'The Champions', 'E=MC Hammer', 'The Mavericks', 'Agatha Quiztie', 'The Aces',
            'Suspiciously Smart', 'The Phoenix', 'The Vanguard', 'The Titans', 'Periodic Table Dancers',
            'The Nomads', 'Universally Challenged', 'The Sharks', 'The Legends', 'Let\'s Get Quizzical',
            'The Vipers', 'The Insiders', 'The Phantoms', 'The Syndicate', 'Quiztopher Columbus',
            'The Einsteins', 'Cleverentines', 'The Tacticians', 'Fast and Curious', 'The Navigators',
            'The Pathfinders', 'The Trailblazers', 'The Codebreakers', 'The Strategists', 'Victorious Secret',
        ],
        'fr' => [
            'Les Cerveaux', 'Les Têtes Brûlées', 'Les Stratèges', 'Les Invincibles', 'Les Outsiders',
            'Team Boussole', 'Les Aventuriers', 'Les Explorateurs', 'Les Conquérants', 'Sans Pitié',
            'La Dream Team', 'Les Rebelles', 'Les Malins', 'Les As de la Carte', 'Les Indomptables',
            'Les Quizards', 'Les Pros de l\'Énigme', 'Les Fines Lames', 'Les Champions', 'Les Mousquetaires',
            'Les Stratèges de l\'Ombre', 'Les Lynx', 'Les Renards Rusés', 'Les Vainqueurs', 'Les Sherlock',
            'Les Détectives', 'Les Aiglons', 'Les Funambules', 'Les Globe-trotters', 'Les Pisteurs',
            'Les Éclaireurs', 'Les Navigateurs', 'Les Cartographes', 'Les Indices Vivants', 'Les Têtes Chercheuses',
            'Les Phénix', 'Les Titans', 'Les Audacieux', 'Les Casse-têtes', 'Les Énigmatiques',
            'Les Vagabonds', 'Les Nomades', 'Les Boussoles Folles', 'Les Maîtres du Jeu', 'Les Increvables',
            'Les Flèches', 'Les Comètes', 'Les Vifs d\'Or', 'Les Cracks', 'La Bande à Part',
        ],
    ],
];

$conn = $db->getConnection();
$conn->beginTransaction();
$totalAdded = 0;
$totalSkipped = 0;
try {
    foreach ($pools as $audience => $byLang) {
        foreach ($byLang as $language => $names) {
            // Existing global names for this scope (case-insensitive dedup).
            $existing = $db->fetchAll(
                'SELECT name FROM team_name_pools WHERE client_id IS NULL AND audience = ? AND language = ?',
                [$audience, $language]
            );
            $seen = [];
            foreach ($existing as $e) { $seen[mb_strtolower(trim($e['name']))] = true; }

            foreach ($names as $name) {
                $name = trim($name);
                if ($name === '') continue;
                $key = mb_strtolower($name);
                if (isset($seen[$key])) { $totalSkipped++; continue; }
                $seen[$key] = true;
                $db->query(
                    'INSERT INTO team_name_pools (client_id, audience, language, name) VALUES (NULL, ?, ?, ?)',
                    [$audience, $language, $name]
                );
                $totalAdded++;
            }
        }
    }

    // Bump the global pool version once (by 0.10) so playgrounds re-sync.
    if ($totalAdded > 0) {
        $db->query(
            "INSERT INTO team_name_pools_meta (scope_key, current_version) VALUES ('global', 0.1)
             ON DUPLICATE KEY UPDATE current_version = current_version + 0.1, updated_at = NOW()"
        );
    }
    $conn->commit();
} catch (Exception $e) {
    $conn->rollBack();
    fwrite(STDERR, "Seed failed: " . $e->getMessage() . "\n");
    exit(1);
}

$ver = $db->fetch("SELECT current_version FROM team_name_pools_meta WHERE scope_key = 'global'");
echo "Team-name catalog seeded: added {$totalAdded}, skipped {$totalSkipped} (already present).\n";
echo "Global pool version is now " . round((float)($ver['current_version'] ?? 0), 2) . ".\n";
