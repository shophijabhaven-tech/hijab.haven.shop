$ErrorActionPreference = 'Continue'
$key = "sb_publishable_P3yvDhbFdSmDnxbgTSROrw_1ef6-TA4"
$h = @{ apikey = $key; Authorization = "Bearer $key" }
$base = "https://tacjzpobeoxyrdrvazni.supabase.co/rest/v1"

function Probe([string]$label, [string]$method, [string]$uri, [string]$body) {
  try {
    if ($method -eq 'GET') { $r = Invoke-RestMethod -Method GET -Headers $h -Uri $uri }
    else { $r = Invoke-RestMethod -Method POST -Headers $h -Uri $uri -ContentType 'application/json' -Body $body }
    "$label => HTTP 200 BODY: $($r | ConvertTo-Json -Compress -Depth 5)"
  } catch {
    $code = 'unknown'
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
    $detail = $_.ErrorDetails.Message
    if (-not $detail -and $_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $detail = $reader.ReadToEnd()
    }
    if (-not $detail) { $detail = $_.Exception.Message }
    "$label => HTTP $code BODY: $detail"
  }
}

Probe 'collections   ' GET  "$base/collections?select=id&limit=1"
Probe 'shop_settings ' GET  "$base/shop_settings?select=upi_id&limit=1"
Probe 'register_v2   ' POST "$base/rpc/register_customer_v2" '{"p_name":"QA Smoke Test","p_phone":"0000000000","p_joined_date":"","p_email":"qa@example.com"}'
Probe 'submit_proof  ' POST "$base/rpc/submit_payment_proof" '{"p_order_code":"HH-99999","p_payment_ref":"PAY-HH-99999","p_proof_path":"HH-99999/x.jpg"}'
