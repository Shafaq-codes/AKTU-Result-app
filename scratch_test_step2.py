import urllib.request
import urllib.parse
import http.cookiejar
import re

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
opener.addheaders = [('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')]

resp = opener.open('https://erp.aktu.ac.in/webpages/oneview/oneview.aspx', timeout=15)
html = resp.read().decode('utf-8', errors='ignore')

vs_match = re.search(r'id="__VIEWSTATE" value="([^"]+)"', html)
vsg_match = re.search(r'id="__VIEWSTATEGENERATOR" value="([^"]+)"', html)

if vs_match and vsg_match:
    viewstate = vs_match.group(1)
    viewstategen = vsg_match.group(1)

    post_data = urllib.parse.urlencode({
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate,
        '__VIEWSTATEGENERATOR': viewstategen,
        'txtRollNo': '2500541530137',
        'btnProceed': 'आगे बढ़े'
    }).encode('utf-8')

    req = urllib.request.Request(resp.geturl(), data=post_data)
    resp2 = opener.open(req, timeout=15)
    html2 = resp2.read().decode('utf-8', errors='ignore')

    print("STEP 2 FINAL URL:", resp2.geturl())
    print("STEP 2 HTML LEN:", len(html2))
    with open('d:/Projects/result app/scratch_step2.html', 'w', encoding='utf-8') as f:
        f.write(html2)
    
    for inp in re.findall(r'<input[^>]+>', html2):
        print("INP:", inp)
else:
    print("ViewState not found")
