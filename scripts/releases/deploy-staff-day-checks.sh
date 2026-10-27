#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
COMMIT=${1:?Pass the reviewed commit.}
APP=/opt/apps/fets-tv
CONTAINER=fets-tv-fets-tv-1
BASE=sha256:17b545f7d63926e17797aa8ab23ee7acd64f24805681e5f24745b7d9c245fba4
[[ $EUID == 0 && $(hostname -s) == srv1120621 && $COMMIT =~ ^[a-f0-9]{40}$ ]] || exit 1
exec 9>/var/lock/fets-online-deploy.lock
flock -n 9 || { echo 'Another Online deployment is running';exit 1; }
COMPOSE_DIR=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$CONTAINER")
[[ $COMPOSE_DIR == /tmp/hstgr-o4zlihqo-dckr-mgr ]] || { echo 'Online Compose context changed; inspect first';exit 1; }
compose() { docker compose --env-file "$R/runtime.env" --project-directory "$COMPOSE_DIR" -f "$APP/compose.yml" -p fets-tv "$@"; }
[[ $(docker inspect -f '{{.Image}}' "$CONTAINER") == "$BASE" ]] || { echo 'Online production changed; inspect before deploying';exit 1; }
REL="$(date -u +%Y%m%dT%H%M%SZ)-staff-day-${COMMIT:0:7}"
R="/opt/fets-online-releases/$REL"
mkdir -p "$R"
[[ $(df -Pk "$R" | awk 'NR==2 {print $4}') -ge 6291456 ]] || { echo 'At least 6 GiB free required';exit 1; }
docker inspect "$CONTAINER" > "$R/container.before.json"
# Hostinger's temporary checkout is gone. Recover interpolation values from
# the running container privately; do not resolve Compose with blank values.
python3 - "$R" <<'PY_ENV'
import pathlib,json,sys
r=pathlib.Path(sys.argv[1]);c=json.loads((r/'container.before.json').read_text())[0]
e=dict(x.split('=',1) for x in c['Config']['Env'])
assert all('\n' not in v and '\r' not in v for v in e.values())
(r/'runtime.env').write_text(''.join(k+'='+v+'\n' for k,v in e.items()))
PY_ENV
printf '%s\n' "$COMPOSE_DIR" > "$R/compose-directory"
compose config --format json > "$R/compose.before.json"
python3 - "$R" <<'PY'
import pathlib,json,sys,hashlib
r=pathlib.Path(sys.argv[1]);c=json.loads((r/'container.before.json').read_text())[0];s=json.loads((r/'compose.before.json').read_text())['services']['fets-tv']
e=dict(x.split('=',1) for x in c['Config']['Env'])
assert c['State']['Running'] and c['Config']['Image']=='fets-tv-fets-tv'
assert not c['Mounts'],'Unexpected mounts require review'
assert all(e.get(k)==str(v or '') for k,v in s.get('environment',{}).items()),'Compose environment differs from running app'
assert e['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')=='https://ueufcqmdqtwvhjjyudeu.supabase.co'
assert e['FETS_LIVE_SUPABASE_URL'].rstrip('/')=='https://qqewusetilxxfvfkmsed.supabase.co'
assert e.get('SUPABASE_SERVICE_ROLE_KEY') and e.get('FETS_LIVE_SUPABASE_KEY')
assert all('\n' not in v and '\r' not in v for v in e.values())
(r/'runtime.env').write_text(''.join(k+'='+v+'\n' for k,v in e.items()))
(r/'build.env').write_text(''.join(k+'='+e[k]+'\n' for k in ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY'])+'NEXT_TELEMETRY_DISABLED=1\n')
def hashes():return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/etc/nginx').rglob('*') if p.is_file()}
(r/'nginx.before.json').write_text(json.dumps(hashes(),sort_keys=True))
PY
printf '%s\n' "$BASE" > "$R/previous-image"
if [[ -f /opt/fets-online-releases/current ]];then cp /opt/fets-online-releases/current "$R/previous-release";fi
echo 'Fetching reviewed source and checking main...'
git clone --single-branch --branch codex/staff-day-checks https://github.com/hy4k/fets.tv.git "$R/source"
git -C "$R/source" fetch origin main:refs/remotes/origin/main
[[ $(git -C "$R/source" rev-parse HEAD) == "$COMMIT" ]]
git -C "$R/source" merge-base --is-ancestor origin/main "$COMMIT"
git -C "$R/source" checkout --detach "$COMMIT"
echo 'Saving rollback image and server configuration...'
docker tag "$BASE" "fets-tv-fets-tv:rollback-$REL"
docker save "fets-tv-fets-tv:rollback-$REL" | gzip -1 > "$R/rollback-image.tar.gz"
cp -a /etc/nginx "$R/nginx.before"
cp "$APP/compose.yml" "$R/compose.original.yml"
cat > "$R/rollback.sh" <<'ROLLBACK'
#!/usr/bin/env bash
set -euo pipefail
release_dir=$(cd "$(dirname "$0")" && pwd)
if ! docker image inspect "$(cat "$release_dir/previous-image")" >/dev/null 2>&1;then
  gzip -dc "$release_dir/rollback-image.tar.gz" | docker load
fi
docker tag "$(cat "$release_dir/previous-image")" fets-tv-fets-tv:latest
docker compose --env-file "$release_dir/runtime.env" --project-directory "$(cat "$release_dir/compose-directory")" -f /opt/apps/fets-tv/compose.yml -p fets-tv up -d --pull never --no-build --no-deps --force-recreate fets-tv
if [[ -f "$release_dir/previous-release" ]];then cp "$release_dir/previous-release" /opt/fets-online-releases/current;fi
echo 'Previous Online website restored. Shared check records remain in FETS Live.'
ROLLBACK
chmod 700 "$R/rollback.sh"
python3 - "$R" "$REL" "$COMMIT" <<'PY'
import pathlib,json,sys
r=pathlib.Path(sys.argv[1]);(r/'source/public').mkdir(exist_ok=True)
(r/'source/public/release.json').write_text(json.dumps({'release':sys.argv[2],'commit':sys.argv[3],'features':['shared-shift-checks','canonical-live-events','verified-staff-identity','named-break-cover','exact-check-log','variable-staff-day-timetable','activation-aware-history','latest-main-tv-and-admin-retained']}))
PY
echo 'Building Online with the existing public frontend settings...'
docker run --rm --memory 2g --memory-swap 3g --cpus 2 --env-file "$R/build.env" -v "$R/source:/app" -w /app node:24-alpine sh -ec 'npm ci --ignore-scripts --no-audit --no-fund; npm run build'
docker tag "$BASE" "fets-tv-fets-tv:base-$REL"
printf 'FROM fets-tv-fets-tv:base-%s\nCOPY source/.next/standalone/ /app/\nCOPY source/.next/static/ /app/.next/static/\nCOPY source/public/ /app/public/\n' "$REL" > "$R/Dockerfile"
printf '*\n!Dockerfile\n!source/\n!source/.next/\n!source/.next/standalone/\n!source/.next/standalone/**\n!source/.next/static/\n!source/.next/static/**\n!source/public/\n!source/public/**\n' > "$R/.dockerignore"
docker build -t "fets-tv-fets-tv:$REL" -f "$R/Dockerfile" "$R"
NEW_IMAGE=$(docker image inspect -f '{{.Id}}' "fets-tv-fets-tv:$REL")
CHECK="fets-online-check-$REL";SWITCHED=0
cleanup() { result=$?;trap - EXIT;docker rm -f "$CHECK" >/dev/null 2>&1 || true;if ((result!=0 && SWITCHED==1));then bash "$R/rollback.sh" || echo "ROLLBACK NEEDS ATTENTION: $R/rollback.sh";fi;exit "$result"; }
trap cleanup EXIT
echo 'Testing candidate startup, authentication and release marker...'
docker run --rm -d --name "$CHECK" --env-file "$R/runtime.env" -p 127.0.0.1::3000 "fets-tv-fets-tv:$REL" >/dev/null
PORT=$(docker port "$CHECK" 3000/tcp | head -n1 | awk -F: '{print $NF}')
curl --retry 10 --retry-all-errors --retry-delay 2 -fsS --max-time 20 "http://127.0.0.1:$PORT/release.json" -o "$R/candidate-release.json"
cmp "$R/candidate-release.json" "$R/source/public/release.json"
[[ $(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/fets-live/checks?date=2026-10-27") == 401 ]]
curl -fsS --max-time 30 "http://127.0.0.1:$PORT/" -o "$R/candidate.html"
echo 'Rechecking repository, running image and configuration before cutover...'
git -C "$R/source" fetch origin main:refs/remotes/origin/main codex/staff-day-checks:refs/remotes/origin/codex/staff-day-checks
[[ $(git -C "$R/source" rev-parse origin/codex/staff-day-checks) == "$COMMIT" ]]
git -C "$R/source" merge-base --is-ancestor origin/main "$COMMIT"
[[ $(docker inspect -f '{{.Image}}' "$CONTAINER") == "$BASE" ]]
compose config --format json > "$R/compose.preswitch.json"
cmp "$R/compose.before.json" "$R/compose.preswitch.json"
python3 - "$R" <<'PY'
import pathlib,json,hashlib,sys
r=pathlib.Path(sys.argv[1]);current={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/etc/nginx').rglob('*') if p.is_file()}
assert current==json.loads((r/'nginx.before.json').read_text()),'Nginx changed during build'
PY
echo 'Switching only the FETS Online service...'
SWITCHED=1
docker tag "$NEW_IMAGE" fets-tv-fets-tv:latest
compose up -d --pull never --no-build --no-deps --force-recreate fets-tv
[[ $(docker inspect -f '{{.Image}}' "$CONTAINER") == "$NEW_IMAGE" ]]
echo 'Verifying public release, authenticated boundary and every new static asset...'
python3 - "$R" <<'PY'
import pathlib,json,hashlib,sys,urllib.request,urllib.error,time
r=pathlib.Path(sys.argv[1]);root=r/'source/.next/static'
checks=[('/release.json',r/'source/public/release.json')]+[('/_next/static/'+p.relative_to(root).as_posix(),p) for p in root.rglob('*') if p.is_file()]
for url,p in checks:
 expected=p.read_bytes()
 for attempt in range(8):
  try:
   with urllib.request.urlopen('https://fets.online'+url,timeout=30) as response:
    data=response.read();ctype=response.headers.get('Content-Type','')
   assert data==expected
   if p.suffix=='.js':assert 'javascript' in ctype
   if p.suffix=='.css':assert 'text/css' in ctype
   break
  except Exception:
   if attempt==7:raise
   time.sleep(2)
try:
 urllib.request.urlopen('https://fets.online/api/fets-live/checks?date=2026-10-27',timeout=30)
 raise AssertionError('Anonymous checks endpoint was not blocked')
except urllib.error.HTTPError as ex:assert ex.code==401
with urllib.request.urlopen('https://fets.online/',timeout=30) as response:assert response.status==200
(r/'public-verification.json').write_text(json.dumps({'files':len(checks),'anonymous_checks_status':401,'homepage_status':200}))
print('Verified',len(checks),'public assets/metadata; anonymous checks return 401.')
PY
docker inspect "$CONTAINER" > "$R/container.after.json"
python3 - "$R" <<'PY'
import pathlib,json,hashlib,sys
r=pathlib.Path(sys.argv[1]);a=json.loads((r/'container.before.json').read_text())[0];b=json.loads((r/'container.after.json').read_text())[0]
assert dict(x.split('=',1) for x in a['Config']['Env'])==dict(x.split('=',1) for x in b['Config']['Env']),'Runtime environment changed'
for k in ['Cmd','Entrypoint','User','WorkingDir','ExposedPorts']:assert a['Config'].get(k)==b['Config'].get(k),k
for k in ['PortBindings','RestartPolicy','ReadonlyRootfs','Privileged','CapAdd','CapDrop','Memory','MemorySwap','NanoCpus','SecurityOpt','ExtraHosts']:assert a['HostConfig'].get(k)==b['HostConfig'].get(k),k
assert a['Mounts']==b['Mounts']
assert set(a['NetworkSettings']['Networks'])==set(b['NetworkSettings']['Networks'])
assert {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/etc/nginx').rglob('*') if p.is_file()}==json.loads((r/'nginx.before.json').read_text())
print('Existing runtime, ports, networks, restart policy and Nginx configuration preserved.')
PY
printf '%s\n' "$REL" > "$R/current.new"
mv "$R/current.new" /opt/fets-online-releases/current
SWITCHED=0
echo "ONLINE WEBSITE DEPLOYED AND VERIFIED: $COMMIT"
echo "Rollback: bash $R/rollback.sh"
