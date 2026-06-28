# تعديلات شبكة الحريق والصمامات (Incendie/Valve)

## نظرة عامة

هذا المستند يلخّص التعديلات التي تمت لمعالجة بيانات شبكة الحريق (`_RESEAU INCENDIE`) والصمامات (`VanneDN*`) في محلل DXF كوفاديس.

## الملفات المُعدّلة

### 1. `src/utils/dxfParser.js`
- **السطر 445-479**: يستخرج أنابيب الحريق والعقد من الطبقة `_RESEAU INCENDIE`
- يفلتر كيانات `LWPOLYLINE` كـ `incendiePipes`
- يفلتر كيانات `INSERT` كـ `incendieNodes`
- يُعيد كل من المصفوفتين مع البيانات المستخرجة

### 2. `src/utils/dxfWriter.js`
- **السطر 3**: إضافة `incendiePipes` و `incendieNodes` إلى المعلمات المفكوكة
- **السطر 192-212**: يكتب أنابيب الحريق كـ `LWPOLYLINE` على الطبقة `_RESEAU INCENDIE`
- **السطر 206-212**: يكتب عقد الحريق كـ `INSERT` مع اسم البلوك
- يستخدم اسم البلوك الافتراضي `PI` إذا لم يُحدّد

### 3. `src/utils/epanetWriter.js`
- **السطر 44-100**: يبني الصمامات من بلوك `VanneDN*` في عقد AEP
- يطابق أسماء البلوك مثل `VanneDN40`, `VanneDN63`, `VanneDN90`, إلخ
- يُنشئ قسم `[VALVES]` في ملف الإخراج EPANET `.inp`
- نوع الصمام: `FCV` (صمام التحكم في التدفق)
- يتخطى البلوك `VanneDN*` عند إضافة العقد (السطر 46-50)
- يتضمّن أيضاً `incendieNodes` كعقد منفصلة (السطر 59-65)

### 4. `src/utils/epanetParser.js`
- **السطر 18-70**: يحلل ملفات EPANET `.inp`
- يستخرج الصمامات من قسم `[VALVES]` إلى كيانات صمام

### 5. `src/utils/covadisUpdater.js`
- **السطر 50-52**: يربط الصمامات بالعقد للمزيّن
- **السطر 148-166**: يُحدّث أسماء البلوك حسب أقطار الصمامات
- يحوّل أقطار الصمامات إلى أسماء بلوك: `VanneDN40`, `VanneDN63`, إلخ

### 6. `src/utils/geoExport.js`
- **السطر 190-206**: يصدّر أنابيب الحريق كميزات GeoJSON `LineString`
- **السطر 198-206**: يصدّر عقد الحريق كميزات GeoJSON `Point`

### 7. `src/components/MapView.jsx`
- **السطر 202, 268**: ينسق أنابيب الحريق باللون الأحمر (`#e31a1c`)
- **السطر 271-277**: يعرض عقد الحريق كدوائر حمراء
- **السطر 714, 802-803**: يعرض عداد عقد الحريق والعرض البياني للطبقات

### 8. `src/components/DataTable.jsx`
- **السطر 97-98, 506-535**: يضيف تبويب "Incendie" مع جدول موحد للعقد والأنابيب
- يعرض عداد العقد وتفاصيل الأنابيب

## تدفق البيانات

```
DXF (طبقة _RESEAU INCENDIE)
    ↓
dxfParser.js → incendiePipes[], incendieNodes[]
    ↓
MapView, DataTable, geoExport, dxfWriter
    ↓
تصدير GeoJSON/Shapefile/DXF
```

## نمط كشف الصمامات

```js
// يطابق VanneDN متبوعاً برقم القطر
const vm = block.match(/VanneDN(\d+)/i)
// أمثلة: VanneDN40, VanneDN63, VanneDN90, VanneDN110
```

## بنية ملف الإخراج EPANET

```ini
[VALVES]
;ID  Node1  Node2  Diameter  Type  Setting  MinorLoss
V1   J1     J1     40.0      FCV   0.0      0.0000
```

## عملية التحويل إلى EPANET (toEpanetInp)

### 1. جمع البيانات والأنابيب

```js
const allPipes = [
  ...aepPipes.map(p => ({ ...p, source: 'aep' })),
  ...dnPipes.map(p => ({ ...p, source: 'dn' })),
]
```

### 2. بناء خريطة العقد

```js
const vertexMap = new Map()
const junctions = []
let junctionCounter = 0

function getOrCreateJunction(v) {
  const key = `${formatCoord(v.x)},${formatCoord(v.y)}`
  if (vertexMap.has(key)) return vertexMap.get(key)
  junctionCounter++
  const id = makeId('J', junctionCounter)
  vertexMap.set(key, id)
  junctions.push({ id, x: v.x, y: v.y, elevation: 0, demand: 0 })
  return id
}
```

### 3. إنشاء العقد من رؤوس الأنابيب

```js
// إنشاء أنابيب لكل قطعة بين رأسين
for (const p of allPipes) {
  const verts = p.vertices || []
  for (let i = 0; i < verts.length - 1; i++) {
    const fromId = getOrCreateJunction(verts[i])
    const toId = getOrCreateJunction(verts[i + 1])
    // ... creates pipe segment P{n}
  }
}
```

### 4. اكتشاف الصمامات (VanneDN*)

```js
// البحث عن الصمامات في عقد AEP
for (const node of aepNodes) {
  const block = node.block || ''
  const vm = block.match(/VanneDN(\d+)/i)  // VanneDN40, VanneDN63, ...
  if (!vm) continue
  const diam = parseInt(vm[1])
  // البحث عن أقرب قطعة أنبوب للصمام
  let bestFromId = null, bestToId = null
  for (const p of aepPipes) {
    // ... finds closest segment via distToSegment()
  }
  valves.push({
    id: makeId('V', valves.length + 1),
    node1: bestFromId,
    node2: bestToId,
    diameter: diam,
    type: 'FCV',  // صمام التحكم في التدفق
    setting: 0,
    minorLoss: 0,
  })
}
```

### 5. تنسيق ملف الإخراج

```js
const inp = []
inp.push('[TITLE]')
inp.push('Covadis AEP conversion')

inp.push('[JUNCTIONS]')        // جميع العقد J1, J2, J3...
inp.push('[PIPES]')            // جميع الأنابيب P1, P2, P3...
inp.push('[VALVES]')           // الصمامات V1, V2... (إن وجدت)
inp.push('[COORDINATES]')      // إحداثيات كل عقدة

return inp.join('\n')
```

---

## تحويل الشبكة الصرفية إلى SWMM

### `src/utils/swmmWriter.js`

يُحوّل بيانات الشبكة الصرفية إلى ملف `.inp` منتهي لبرنامج SWMM:

### 1. جمع البيانات

```js
const { manholes = [], planPipes = [], profileSegments = [], profiles = [], dnPipes = [], assaiNodes = [] } = data

// بناء خريطة المنهولات: id -> مستوى القاحور
const manholeMap = new Map()
for (const m of manholes) {
  manholeMap.set(m.id || m.profileId, {
    elevation: parseFloat(m.profileInvert || m.cr || 0),
    ground: parseFloat(m.profileGround || m.ct || 0),
  })
}
```

### 2. إنشاء العقد (JUNCTIONS)

```js
const junctions = []
for (const m of manholes) {
  junctions.push({
    id: m.id || `J${junctionCounter}`,
    elevation: parseFloat(m.profileInvert || m.cr || 0),
    maxHeight: (parseFloat(m.profileGround || m.ct || 0) - elev).toFixed(2),
  })
}
```

### 3. إنشاء الأنابيب (CONDUITS)

```js
const conduits = []
const xsections = []
for (const seg of profileSegments) {
  if (!seg.fromNode || !seg.toNode) continue
  
  conduits.push({
    id: makeId('C', conduitCounter),
    fromNode: seg.fromNode,
    toNode: seg.toNode,
    length: seg.length_m || 0,
    roughness: 0.012,  // قيمة افتراضية للخرسانة
  })
  xsections.push({
    id: makeId('C', conduitCounter),
    shape: 'CIRCULAR',
    diameter: (seg.diam || 300) / 304.8,  // ملم → قدم
  })
}
```

### 4. العناصر الخارجية (OUTFALLS)

```js
// إيجاد المنهول الأدنى كخروج
let minElevation = Infinity
for (const m of manholes) {
  if (parseFloat(m.profileInvert || m.cr || 0) < minElevation) {
    outfallManhole = m
    minElevation = parseFloat(m.profileInvert || m.cr || 0)
  }
}
```

### بنية ملف الإخراج SWMM

```ini
[TITLE]
;;Covadis Sewer Network - SWMM Export

[OPTIONS]
FLOW_UNITS           CMS      ; متر مكعب/ثانية
INFILTRATION         NONE     ; بلا تسرب

[JUNCTIONS]            ; المنهولات كعقد
J1       430.75        0        0    0

[OUTFALLS]             ; نقطة الخروج
O1       430.20        0        0    0    OUTLET

[CONDUITS]             ; الأنابيب
C1       J1          J2       25.3     0.012

[XSECTIONS]            ; المقطع العطلي
C1       CIRCULAR    0.30               ; قطر بالقدم

[COORDINATES]          ; الإحداثيات
J1       790123.45   2170000.12
```