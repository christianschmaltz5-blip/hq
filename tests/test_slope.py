"""Slope storage: ring hash agrees with the page, Python slope math agrees with the page's slopeCells."""
import json, re, shutil, subprocess, sys, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agents" / "phx_land_leads"))
import slope

RING = [[-112.123456789, 33.5], [-112.1, 33.51], [-112.12, 33.49], [-112.123456789, 33.5]]
HTML = (ROOT / "phx-land-leads.html").read_text()


def js(expr):
    fns = re.search(r"function ringHash[\s\S]*?\n", HTML).group(0) + re.search(r"function slopeCells[\s\S]*?\n}\n", HTML).group(0)
    out = subprocess.run(["node", "-e", fns + f"console.log(JSON.stringify({expr}))"], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


@unittest.skipUnless(shutil.which("node"), "node missing")
class SlopeTest(unittest.TestCase):
    def test_ring_hash_matches_js(self):
        self.assertEqual(slope.ring_hash(RING), js(f"ringHash({json.dumps(RING)})"))

    def test_slope_cells_match_js_on_plane_and_with_holes(self):
        z = [0.3 * (k % 4) * 5 + 0.4 * (k // 4) * 5 for k in range(16)]
        self.assertTrue(all(abs(s - 50) < 1e-9 for s in slope.slope_cells(z, 4, 4, 5, 5)))
        z[5] = None
        z[0] = None
        got, want = slope.slope_cells(z, 4, 4, 5, 5), js(f"slopeCells({json.dumps(z)}, 4, 4, 5, 5)")
        self.assertEqual([x is None for x in got], [x is None for x in want])
        self.assertTrue(all(abs(a - b) < 1e-9 for a, b in zip(got, want) if a is not None))

    def test_build_plane(self):  # ~0.0003 deg square lot tilted 10% east-west
        ring = [[-112.0, 33.5], [-111.997, 33.5], [-111.997, 33.503], [-112.0, 33.503], [-112.0, 33.5]]
        _, _, kx, nx, ny, dx, dy, cells = slope.grid(ring)
        v = [0.1 * c["x"] for c in cells]
        rec = slope.build(ring, v)
        self.assertAlmostEqual(rec["avg"], 10, delta=0.01)
        self.assertEqual(rec["ringHash"], slope.ring_hash(ring))
        self.assertIsNone(slope.build(ring, [None] * len(v)))


if __name__ == "__main__":
    unittest.main()
