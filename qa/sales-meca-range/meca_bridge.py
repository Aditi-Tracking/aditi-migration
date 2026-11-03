"""READ-ONLY bridge for the browser check of the MeCa tab. Answers the three calls the tab makes (lc_my_access, sales_meca_summary, sales_meca_leads) from the LIVE
database, running the real functions inside a read-only transaction (always rolled back) as the identity named in ?who= (ADMIN = the Managing Director, or an email).
Nothing else is reachable: any other function name is refused. Listens on 127.0.0.1 only. Usage: python meca_bridge.py [port]"""
import sys, os, re, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
HERE = os.path.dirname(os.path.abspath(__file__))
import psycopg  # pip install "psycopg[binary]"
url = None
for line in open(os.path.join(HERE, "..", "..", ".env"), encoding="utf-8"):
    m = re.match(r"\s*SUPABASE_LEADCAPTURE_URL\s*=\s*(.*)\s*$", line)
    if m:
        url = re.sub(r":\[([^\]@]*)\]@", lambda x: ":" + x.group(1) + "@", m.group(1).strip().strip('"').strip("'"))
SQL = {
    "lc_my_access": ("select public.lc_my_access()", lambda b: ()),
    "sales_meca_leads": ("select public.sales_meca_leads(p_rep_email => %s, p_rep_label => %s, p_from => %s::date, p_to => %s::date, p_kind => %s)", lambda b: (b.get("p_rep_email"), b.get("p_rep_label"), b["p_from"], b["p_to"], b["p_kind"])),
    "sales_meca_summary": ("select public.sales_meca_summary(p_from => %s::date, p_to => %s::date, p_bucket => %s)", lambda b: (b["p_from"], b["p_to"], b["p_bucket"])),
}
LOG = []

def call(fn, body, who):
    with psycopg.connect(url, autocommit=False) as conn:
        conn.read_only = True
        with conn.cursor() as c:
            c.execute("select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', coalesce(nullif(%s,'ADMIN'), (select \"Email_Id\" from public.\"Employee_details\" where lower(trim(\"Employee_Dept\")) = 'managing director' and \"Email_Id\" is not null order by \"Emp_id\" limit 1)), 'role', 'authenticated')::text, true)", (who,))
            sql, args = SQL[fn]
            c.execute(sql, args(body))
            out = c.fetchone()[0]
        conn.rollback()
    return out

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj):
        data = json.dumps(obj, default=str).encode()
        self.send_response(code)
        for k, v in (("Content-Type", "application/json"), ("Access-Control-Allow-Origin", "*"), ("Access-Control-Allow-Headers", "*"), ("Access-Control-Allow-Methods", "POST, GET, OPTIONS")):
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self): self._send(200, {})
    def do_GET(self): self._send(200, {"log": LOG}) if self.path.startswith("/log") else self._send(404, {})
    def do_POST(self):
        u = urlparse(self.path); q = parse_qs(u.query); fn = u.path.rsplit("/", 1)[-1]; who = (q.get("who") or ["ADMIN"])[0]
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if fn not in SQL: return self._send(403, {"message": "not allowed"})
        try:
            out = call(fn, body, who); LOG.append({"fn": fn, "who": who, "body": body, "ok": True}); self._send(200, out)
        except Exception as e:
            LOG.append({"fn": fn, "who": who, "body": body, "ok": False, "err": str(e)[:200]}); self._send(400, {"message": str(e)[:300]})

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5390
print("bridge on 127.0.0.1:%d (read-only, live)" % port, flush=True)
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
