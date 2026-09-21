import urllib.request
import re

url = 'https://erp.aktu.ac.in/webpages/oneview/oneview.aspx'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode('utf-8', errors='ignore')
        print("FINAL URL:", resp.geturl())
        print("CONTENT LENGTH:", len(content))
        with open("scratch/oneview_page.html", "w", encoding="utf-8") as f:
            f.write(content)
        
        inputs = re.findall(r'<input[^>]+>', content)
        print("\n--- INPUTS ---")
        for i in inputs:
            print(i)
        
        panels = re.findall(r'<div[^>]+id=[\'"][^\'"]+[\'"][^>]*>', content)
        print("\n--- DIV IDS ---")
        for p in panels[:25]:
            print(p)
except Exception as e:
    print("ERROR:", e)
