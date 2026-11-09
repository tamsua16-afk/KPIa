<?php
/**
 * KPI 2027 – Khối IID : Server-side JSON Storage API (Plesk / Apache / Nginx / PHP)
 * Giúp đồng bộ tài khoản nhân sự, phân quyền và dữ liệu KPI giữa tất cả người dùng trên Hosting.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$dataDir = __DIR__ . '/data';
$storeFile = $dataDir . '/kpi_store.json';
$fallbackFile = __DIR__ . '/kpi_store.json';
$tempFile = rtrim(sys_get_temp_dir(), '/\\') . '/tenten_kpi_2027_' . md5(__DIR__) . '.json';

if (!is_dir($dataDir)) {
  @mkdir($dataDir, 0775, true);
}
if (is_dir($dataDir) && is_writable($dataDir)) {
  $htaccessFile = $dataDir . '/.htaccess';
  if (!file_exists($htaccessFile)) {
    @file_put_contents($htaccessFile, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n");
  }
}

$candidates = [$storeFile, $fallbackFile, $tempFile];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $bestRaw = null;
  $bestTs = -1;
  foreach ($candidates as $file) {
    if ($file && file_exists($file) && is_readable($file)) {
      $raw = @file_get_contents($file);
      if ($raw !== false && strlen(trim($raw)) > 2) {
        $dec = @json_decode($raw, true);
        if (is_array($dec) && isset($dec['iid'])) {
          $ts = isset($dec['updatedAt']) ? (float)$dec['updatedAt'] : (float)@filemtime($file);
          if ($ts >= $bestTs) {
            $bestTs = $ts;
            $bestRaw = $raw;
          }
        }
      }
    }
  }
  if ($bestRaw !== null) {
    echo $bestRaw;
    exit;
  }
  echo json_encode(['empty' => true]);
  exit;
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  if ((!$raw || !strlen(trim($raw))) && isset($_POST['payload'])) {
    $raw = $_POST['payload'];
  }
  if (!$raw) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Empty request body']);
    exit;
  }
  $decoded = json_decode($raw, true);
  if (!is_array($decoded) || !isset($decoded['iid']) || !isset($decoded['depts']) || !isset($decoded['emps'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid KPI data payload']);
    exit;
  }

  $written = false;
  foreach ($candidates as $file) {
    $w = @file_put_contents($file, $raw, LOCK_EX);
    if ($w !== false) {
      $written = $w;
      break;
    }
  }

  if ($written === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot write data file on server']);
    exit;
  }

  echo json_encode(['ok' => true, 'bytes' => $written]);
  exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
