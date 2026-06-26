/**
 * Decode AutoCAD Proxy Entity Graphics binary data.
 *
 * Format: header (8 bytes) then sequence of sub-entities:
 *   [4 bytes LE: total chunk size][4 bytes LE: type code][payload]
 *
 * Type codes (ProxyGraphicTypes):
 *   1=EXTENTS, 2=CIRCLE, 6=POLYLINE, 7=POLYGON, 10=TEXT, 14=ATTRIBUTE_COLOR,
 *   16=ATTRIBUTE_LAYER, 22=ATTRIBUTE_TRUE_COLOR, 23=ATTRIBUTE_LINEWEIGHT,
 *   29=PUSH_MATRIX, 30=PUSH_MATRIX2, 31=POP_MATRIX, 33=LWPOLYLINE,
 *   36=UNICODE_TEXT, 38=UNICODE_TEXT2
 */

const T = {
  EXTENTS: 1, CIRCLE: 2, CIRCLE_3P: 3, CIRCULAR_ARC: 4, CIRCULAR_ARC_3P: 5,
  POLYLINE: 6, POLYGON: 7, MESH: 8, SHELL: 9, TEXT: 10, TEXT2: 11,
  XLINE: 12, RAY: 13, ATTRIBUTE_COLOR: 14, ATTRIBUTE_LAYER: 16,
  ATTRIBUTE_LINETYPE: 18, ATTRIBUTE_MARKER: 19, ATTRIBUTE_FILL: 20,
  ATTRIBUTE_TRUE_COLOR: 22, ATTRIBUTE_LINEWEIGHT: 23,
  PUSH_MATRIX: 29, PUSH_MATRIX2: 30, POP_MATRIX: 31,
  POLYLINE_WITH_NORMALS: 32, LWPOLYLINE: 33, UNICODE_TEXT: 36, UNICODE_TEXT2: 38,
}

class ByteStream {
  constructor(buf) {
    if (buf instanceof ArrayBuffer) {
      this._dv = new DataView(buf);
    } else if (buf instanceof Uint8Array) {
      this._dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    } else {
      throw new Error('ByteStream: expected ArrayBuffer or Uint8Array');
    }
    this._idx = 0;
  }
  align() { this._idx = (this._idx + 3) & ~3; }
  readLong() { const v = this._dv.getInt32(this._idx, true); this._idx += 4; return v >>> 0; }
  readSignedLong() { const v = this._dv.getInt32(this._idx, true); this._idx += 4; return v; }
  readDouble() { const v = this._dv.getFloat64(this._idx, true); this._idx += 8; return v; }
  readVertex() { return [this.readDouble(), this.readDouble(), this.readDouble()]; }
  readPaddedString() {
    const arr = new Uint8Array(this._dv.buffer, this._dv.byteOffset, this._dv.byteLength);
    let end = this._idx;
    while (end < arr.length && arr[end] !== 0) end++;
    const s = new TextDecoder('iso-8859-1').decode(arr.slice(this._idx, end));
    this._idx = end + 1;
    this.align();
    return s;
  }
  readPaddedUnicodeString() {
    const arr = new Uint8Array(this._dv.buffer, this._dv.byteOffset, this._dv.byteLength);
    let end = this._idx;
    while (end + 1 < arr.length && !(arr[end] === 0 && arr[end + 1] === 0)) end += 2;
    const s = new TextDecoder('utf-16le').decode(arr.slice(this._idx, end));
    this._idx = end + 2;
    this.align();
    return s;
  }
  done() { return this._idx >= this._dv.byteLength; }
}

/**
 * Decode proxy graphic binary data into an array of { type, data } objects.
 * type is the ProxyGraphicTypes name (lowercase) or 'UNKNOWN_n'.
 */
export function decodeProxyGraphic(hexStr) {
  const bytes = hexToBytes(hexStr);
  if (bytes.length < 8) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entities = [];
  let pos = 8; // skip 8-byte header

  const state = { color: 256, layer: '0', lineweight: -3, ltscale: 1, fill: false, trueColor: null };

  while (pos + 8 <= bytes.length) {
    const size = dv.getUint32(pos, true);
    const typeCode = dv.getUint32(pos + 4, true);
    const payload = bytes.slice(pos + 8, pos + size);
    const typeName = Object.keys(T).find(k => T[k] === typeCode) || `UNKNOWN_${typeCode}`;

    try {
      const result = decodeSubEntity(typeCode, payload, state);
      if (result) {
        if (Array.isArray(result)) entities.push(...result);
        else entities.push(result);
      }
    } catch (e) {
      console.warn('ProxyGraphic: error decoding sub-entity type=' + typeCode + ' size=' + size + ': ' + e.message);
    }

    pos += size;
  }

  return entities;
}

function decodeSubEntity(typeCode, payload, state) {
  switch (typeCode) {
    case T.ATTRIBUTE_COLOR: {
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      state.color = dv.getUint32(0, true);
      if (state.color < 0 || state.color > 256) state.color = 256;
      state.trueColor = null;
      return null;
    }
    case T.ATTRIBUTE_TRUE_COLOR: {
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      state.trueColor = dv.getUint32(0, true);
      state.color = 256;
      return null;
    }
    case T.ATTRIBUTE_LAYER: {
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      state.layer = String(dv.getUint32(0, true));
      return null;
    }
    case T.ATTRIBUTE_LINEWEIGHT: {
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      state.lineweight = dv.getInt32(0, true);
      return null;
    }
    case T.PUSH_MATRIX:
    case T.PUSH_MATRIX2:
      return null; // ignoring matrices for now
    case T.POP_MATRIX:
      return null;
    case T.EXTENTS:
      return null;
    case T.ATTRIBUTE_LINETYPE:
    case T.ATTRIBUTE_MARKER:
    case T.ATTRIBUTE_FILL:
      return null;

    case T.POLYLINE:
    case T.POLYGON: {
      const bs = new ByteStream(payload);
      const count = bs.readLong();
      const verts = [];
      for (let i = 0; i < count; i++) {
        const [x, y, z] = bs.readVertex();
        verts.push([x, y]);
      }
      if (verts.length < 2) return null;
      return { type: 'POLYLINE', vertices: verts, layer: state.layer, color: state.color, closed: typeCode === T.POLYGON };
    }

    case T.POLYLINE_WITH_NORMALS: {
      const bs = new ByteStream(payload);
      let count = bs.readLong();
      count += 1; // last vertex is the normal
      const verts = [];
      for (let i = 0; i < count - 1; i++) {
        const [x, y, z] = bs.readVertex();
        verts.push([x, y]);
      }
      if (verts.length < 2) return null;
      return { type: 'POLYLINE', vertices: verts, layer: state.layer, color: state.color };
    }

    case T.TEXT:
    case T.UNICODE_TEXT: {
      const bs = new ByteStream(payload);
      const startPt = bs.readVertex();
      const normal = bs.readVertex();
      const direction = bs.readVertex();
      const height = bs.readDouble();
      const widthFactor = bs.readDouble();
      const oblique = bs.readDouble();
      const text = typeCode === T.UNICODE_TEXT ? bs.readPaddedUnicodeString() : bs.readPaddedString();
      return { type: 'TEXT', insert: [startPt[0], startPt[1]], text, height, width: widthFactor, rotation: Math.atan2(direction[1], direction[0]) * 180 / Math.PI, layer: state.layer, color: state.color };
    }

    case T.TEXT2:
    case T.UNICODE_TEXT2: {
      const bs = new ByteStream(payload);
      const startPt = bs.readVertex();
      const normal = bs.readVertex();
      const direction = bs.readVertex();
      const text = typeCode === T.UNICODE_TEXT2 ? bs.readPaddedUnicodeString() : bs.readPaddedString();
      bs.readSignedLong(); bs.readSignedLong(); // ignore length_of_string, raw
      const height = bs.readDouble();
      const widthFactor = bs.readDouble();
      const oblique = bs.readDouble();
      const tracking = bs.readDouble();
      return { type: 'TEXT', insert: [startPt[0], startPt[1]], text, height, width: widthFactor, rotation: Math.atan2(direction[1], direction[0]) * 180 / Math.PI, layer: state.layer, color: state.color };
    }

    default:
      return null;
  }
}

function hexToBytes(hex) {
  const h = hex.replace(/\s/g, '');
  const len = h.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(h.substr(i * 2, 2), 16);
  return bytes;
}
