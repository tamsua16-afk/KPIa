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

if (!is_dir($dataDir)) {
  @mkdir($dataDir, 0755, true);
}
if (is_dir($dataDir) && is_writable($dataDir)) {
  $htaccessFile = $dataDir . '/.htaccess';
  if (!file_exists($htaccessFile)) {
    @file_put_contents($htaccessFile, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n");
  }
} else {
  $storeFile = $fallbackFile;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $target = file_exists($storeFile) ? $storeFile : (file_exists($fallbackFile) ? $fallbackFile : null);
  if ($target && is_readable($target)) {
    $raw = @file_get_contents($target);
    if ($raw !== false && strlen(trim($raw)) > 2) {
      echo $raw;
      exit;
    }
  }
  echo json_encode(['empty' => true]);
  exit;
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
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

  $written = @file_put_contents($storeFile, $raw, LOCK_EX);
  if ($written === false && $storeFile !== $fallbackFile) {
    $written = @file_put_contents($fallbackFile, $raw, LOCK_EX);
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
