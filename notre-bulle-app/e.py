import zipfile, os, sys
z = sys.argv[1]
d = sys.argv[2]
with zipfile.ZipFile(z) as zf:
    zf.extractall(d)
print("OK")
