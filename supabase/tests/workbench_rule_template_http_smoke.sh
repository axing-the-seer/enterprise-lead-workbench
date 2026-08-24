#!/bin/zsh

# Local-only integration smoke for the authenticated PostgREST rule-save path.
# It creates disposable Auth/workspace fixtures; run `supabase db reset` after it.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
eval "$(npx supabase status -o env 2>/dev/null)"

smoke_suffix="$(date +%s)"
owner_email="rule-owner-${smoke_suffix}@example.test"
viewer_email="rule-viewer-${smoke_suffix}@example.test"
smoke_password="RuleSmoke-$(openssl rand -hex 12)-Aa1!"
owner_claim="$(uuidgen | tr '[:upper:]' '[:lower:]')"
viewer_claim="$(uuidgen | tr '[:upper:]' '[:lower:]')"

owner_claim_result="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/issue_user_provisioning_claim" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg id "$owner_claim" --arg email "$owner_email" \
    '{p_claim_id:$id,p_email:$email,p_purpose:"administrator",p_administrator:true}')")"
test "$owner_claim_result" = "true"

owner_create="$(curl --silent --show-error --fail-with-body \
  "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg email "$owner_email" --arg password "$smoke_password" --arg claim "$owner_claim" \
    '{email:$email,password:$password,email_confirm:true,user_metadata:{first_name:"Rule",last_name:"Owner",workbench_provisioning_claim_id:$claim}}')")"
owner_id="$(jq -er '.id // .user.id' <<<"$owner_create")"

owner_login="$(curl --silent --show-error --fail-with-body \
  "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg email "$owner_email" --arg password "$smoke_password" \
    '{email:$email,password:$password}')")"
owner_token="$(jq -er '.access_token' <<<"$owner_login")"

initialized="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/initialize_workbench_workspace" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg slug "rule-real-rpc-smoke-${smoke_suffix}" \
    '{p_workspace_name:"规则真实接口验收空间",p_workspace_slug:$slug}')")"
workspace_id="$(jq -er '.[0].workspace_id' <<<"$initialized")"
rule_set_id="$(jq -er '.[0].default_rule_set_id' <<<"$initialized")"

viewer_claim_result="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/issue_user_provisioning_claim" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg id "$viewer_claim" --arg email "$viewer_email" \
    '{p_claim_id:$id,p_email:$email,p_purpose:"administrator",p_administrator:false}')")"
test "$viewer_claim_result" = "true"

viewer_create="$(curl --silent --show-error --fail-with-body \
  "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg email "$viewer_email" --arg password "$smoke_password" --arg claim "$viewer_claim" \
    '{email:$email,password:$password,email_confirm:true,user_metadata:{first_name:"Rule",last_name:"Viewer",workbench_provisioning_claim_id:$claim}}')")"
viewer_id="$(jq -er '.id // .user.id' <<<"$viewer_create")"

viewer_login="$(curl --silent --show-error --fail-with-body \
  "$API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$(jq -nc --arg email "$viewer_email" --arg password "$smoke_password" \
    '{email:$email,password:$password}')")"
viewer_token="$(jq -er '.access_token' <<<"$viewer_login")"

curl --silent --show-error --fail-with-body \
  "$REST_URL/workspace_members" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  --data-binary "$(jq -nc --arg ws "$workspace_id" --arg viewer "$viewer_id" --arg owner "$owner_id" \
    '{workspace_id:$ws,user_id:$viewer,role:"viewer",status:"active",invited_by:$owner}')" >/dev/null

rule_definition="$(jq -nc '{
  id:"client-placeholder",
  name:"客户端占位名称",
  eligibility:{
    root:{id:"root",combinator:"and",rules:[
      {id:"status-gate",label:"经营状态",field:"status.normalized",operator:"eq",value:"active",missingPolicy:"review",enabled:true}
    ]},
    onNoMatch:"exclude",
    onUnknown:"review"
  },
  rules:[
    {id:"capital-score",label:"注册资本",kind:"priority",field:"registeredCapital.valueWan",operator:"gte",value:1000,weight:20,onMatch:"score",missingPolicy:"review",enabled:true}
  ],
  thresholds:{p1:75,p2:50,minimumCompleteness:60}
}')"

first_payload="$(jq -nc --arg ws "$workspace_id" --arg rs "$rule_set_id" --argjson rule "$rule_definition" '{
  p_workspace_id:$ws,
  p_rule_set_id:$rs,
  p_name:"真实接口规则",
  p_description:"首次版本",
  p_business_objective:"验证真实 Auth 与 PostgREST 的原子规则保存",
  p_rule_definition:$rule,
  p_scoring_definition:{engineVersion:"lead-rules-v1"},
  p_change_note:"真实接口首次发布"
}')"

first_result="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  --data-binary "$first_payload")"
retry_result="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  --data-binary "$first_payload")"

first_version="$(jq -er '.[0].version_number' <<<"$first_result")"
first_version_id="$(jq -er '.[0].rule_version_id' <<<"$first_result")"
retry_version="$(jq -er '.[0].version_number' <<<"$retry_result")"
retry_version_id="$(jq -er '.[0].rule_version_id' <<<"$retry_result")"
test "$first_version" = "2"
test "$retry_version" = "2"
test "$first_version_id" = "$retry_version_id"

viewer_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $viewer_token" \
  -H "Content-Type: application/json" \
  --data-binary "$first_payload")"
anon_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "$first_payload")"

rule_a="$(jq -c '.rules[0].weight=21' <<<"$rule_definition")"
rule_b="$(jq -c '.rules[0].weight=22' <<<"$rule_definition")"
payload_a="$(jq -nc --arg ws "$workspace_id" --arg rs "$rule_set_id" --argjson rule "$rule_a" '{
  p_workspace_id:$ws,p_rule_set_id:$rs,p_name:"真实接口规则",
  p_description:"并发版本 A",p_business_objective:"验证真实 Auth 与 PostgREST 的原子规则保存",
  p_rule_definition:$rule,p_scoring_definition:{engineVersion:"lead-rules-v1"},p_change_note:"并发发布 A"
}')"
payload_b="$(jq -nc --arg ws "$workspace_id" --arg rs "$rule_set_id" --argjson rule "$rule_b" '{
  p_workspace_id:$ws,p_rule_set_id:$rs,p_name:"真实接口规则",
  p_description:"并发版本 B",p_business_objective:"验证真实 Auth 与 PostgREST 的原子规则保存",
  p_rule_definition:$rule,p_scoring_definition:{engineVersion:"lead-rules-v1"},p_change_note:"并发发布 B"
}')"

smoke_dir="$(mktemp -d)"
cleanup_smoke() {
  if test -n "${smoke_dir:-}" && test -d "$smoke_dir"; then
    rm -rf -- "$smoke_dir"
  fi
}
trap cleanup_smoke EXIT

curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  --data-binary "$payload_a" >"$smoke_dir/a.json" &
pid_a=$!
curl --silent --show-error --fail-with-body \
  "$REST_URL/rpc/save_rule_template" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token" \
  -H "Content-Type: application/json" \
  --data-binary "$payload_b" >"$smoke_dir/b.json" &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

concurrent_versions="$(jq -sc 'map(.[0].version_number) | sort' "$smoke_dir/a.json" "$smoke_dir/b.json")"
test "$concurrent_versions" = '[3,4]'

published_versions="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rule_set_versions?workspace_id=eq.${workspace_id}&rule_set_id=eq.${rule_set_id}&status=eq.published&select=version_number&order=version_number.asc" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token")"
current_rule_set="$(curl --silent --show-error --fail-with-body \
  "$REST_URL/rule_sets?workspace_id=eq.${workspace_id}&id=eq.${rule_set_id}&select=current_version_number,status" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $owner_token")"
persisted_versions="$(jq -c 'map(.version_number)' <<<"$published_versions")"
current_version="$(jq -er '.[0].current_version_number' <<<"$current_rule_set")"
current_status="$(jq -er '.[0].status' <<<"$current_rule_set")"
test "$persisted_versions" = '[2,3,4]'
test "$current_version" = "4"
test "$current_status" = "active"
test "$viewer_status" = "403"
test "$anon_status" = "401"

jq -n \
  --argjson first_version "$first_version" \
  --argjson concurrent_versions "$concurrent_versions" \
  --argjson persisted_versions "$persisted_versions" \
  --argjson current_version "$current_version" \
  --arg current_status "$current_status" \
  --argjson viewer_http "$viewer_status" \
  --argjson anon_http "$anon_status" \
  '{
    auth_password_login:true,
    first_published_version:$first_version,
    exact_retry_reused:true,
    concurrent_versions:$concurrent_versions,
    persisted_published_versions:$persisted_versions,
    current_version:$current_version,
    current_status:$current_status,
    viewer_http:$viewer_http,
    anon_http:$anon_http
  }'
