"""Insert our entry at the end of vercel/ai content/tools-registry/registry.ts. Usage: make_registry.py in.ts out.ts"""
import sys
src = open(sys.argv[1]).read()
entry = open(__file__.rsplit("/", 1)[0] + "/entry.ts.txt").read()
if "slug: 'cyberwarex'" in src:
    sys.exit("already listed")
end = src.rstrip().rfind("];")
assert end > 0 and src[:end].rstrip().endswith("},"), "unexpected end of tools array"
open(sys.argv[2], "w").write(src[:end] + entry + src[end:])
