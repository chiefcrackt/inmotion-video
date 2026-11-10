# Minimal SoundFont 2 reader: presets -> instruments -> sample zones.
import struct, sys
GEN_KEYRANGE, GEN_VELRANGE, GEN_INSTRUMENT, GEN_SAMPLEID, GEN_ROOT, GEN_SMODES = 43, 44, 41, 53, 58, 54
GEN_COARSE, GEN_FINE = 51, 52

def chunks(data, off, end):
    while off < end:
        cid, size = struct.unpack_from('<4sI', data, off)
        yield cid.decode('latin1'), off + 8, size
        off += 8 + size + (size & 1)

class SF2:
    def __init__(self, path):
        d = open(path, 'rb').read()
        assert d[:4] == b'RIFF' and d[8:12] == b'sfbk'
        self.d = d
        p = {}
        for cid, o, s in chunks(d, 12, len(d)):
            if cid == 'LIST':
                kind = d[o:o+4].decode()
                for c2, o2, s2 in chunks(d, o + 4, o + s):
                    p[(kind, c2)] = (o2, s2)
        self.smpl_off = p[('sdta', 'smpl')][0]
        def recs(name, fmt):
            o, s = p[('pdta', name)]
            n = struct.calcsize(fmt)
            return [struct.unpack_from(fmt, d, o + i * n) for i in range(s // n)]
        self.phdr = recs('phdr', '<20sHHHIII')
        self.pbag = recs('pbag', '<HH')
        self.pgen = recs('pgen', '<HH')
        self.inst = recs('inst', '<20sH')
        self.ibag = recs('ibag', '<HH')
        self.igen = recs('igen', '<HH')
        self.shdr = recs('shdr', '<20sIIIIIBbHH')

    @staticmethod
    def name(b):
        return b.split(b'\0')[0].decode('latin1')

    def _zones(self, hdrs, bagidx, bags, gens, i):
        out = []
        for z in range(hdrs[i][bagidx], hdrs[i + 1][bagidx]):
            g0, g1 = bags[z][0], bags[z + 1][0]
            out.append({op: amt for op, amt in gens[g0:g1]})
        return out

    def preset(self, bank, prog):
        for i, h in enumerate(self.phdr[:-1]):
            if h[1] == prog and h[2] == bank:
                return i
        raise KeyError((bank, prog))

    def sample_zones(self, bank, prog):
        res = []
        pi = self.preset(bank, prog)
        for pz in self._zones(self.phdr, 3, self.pbag, self.pgen, pi):
            if GEN_INSTRUMENT not in pz:
                continue
            ii = pz[GEN_INSTRUMENT]
            pkr = pz.get(GEN_KEYRANGE, 127 << 8)
            for iz in self._zones(self.inst, 1, self.ibag, self.igen, ii):
                if GEN_SAMPLEID not in iz:
                    continue
                kr = iz.get(GEN_KEYRANGE, 127 << 8)
                vr = iz.get(GEN_VELRANGE, 127 << 8)
                sh = self.shdr[iz[GEN_SAMPLEID]]
                root = iz.get(GEN_ROOT, sh[6])
                if root == 0xFFFF or root > 127: root = sh[6]
                fine = struct.unpack('<h', struct.pack('<H', iz.get(GEN_FINE, 0)))[0] + sh[7]
                res.append(dict(inst=self.name(self.inst[ii][0]), sample=self.name(sh[0]), sid=iz[GEN_SAMPLEID],
                    lo=kr & 255, hi=kr >> 8, vlo=vr & 255, vhi=vr >> 8, plo=pkr & 255, phi=pkr >> 8,
                    root=root, fine=fine, rate=sh[5], start=sh[1], end=sh[2], ls=sh[3], le=sh[4],
                    mode=iz.get(GEN_SMODES, 0), type=sh[9]))
        return res

    def pcm(self, z):
        import numpy as np
        a = np.frombuffer(self.d, dtype='<i2', count=z['end'] - z['start'], offset=self.smpl_off + 2 * z['start'])
        return a.astype('float32') / 32768.0
