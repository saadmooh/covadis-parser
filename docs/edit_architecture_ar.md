# شرح معماريّة تعديل بيانات Covadis DXF

## نظرة عامة على التدفق

```
DXF/JSON  →  [DxfUploader]  →  parseCovadisDxf()  →  JSON (manholes, segments, ...)
                                                            │
                                                            ▼
                                                     [MapView]
                                                     editManholes[]
                                                     editPipes[]
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                          ▼                                   ▼
                                   أدوات التحرير                      handleSaveDxf()
                                   (➕Regard, ➡Tuyau,                     │
                                    🗑Suppr, ✏Prop)                       ▼
                                                                   toDxfString()
                                                                         │
                                                                         ▼
                                                                   Blob → download
```

## 1. هيكل البيانات

### المصدر (من parser)

```js
// المنهولات المستخرجة من DXF
data.manholes = [
  { id: 'R1', ct: '433.05', cr: '430.75', pp: '2.30', x: 790123.45, y: 2170000.12 },
  ...
]

// القطع الفردية بين المنهولات من المقاطع الطولية
data.profileSegments = [
  {
    fromNode: 'R1', toNode: 'R2',
    start: { x: 790123.45, y: 2170000.12 },
    end:   { x: 790145.67, y: 2170020.34 },
    diam: 315, material: 'PVC',
    length_m: 25.3, slope_pct: 1.2,
  },
  ...
]
```

### حالة التحرير (في MapView.jsx)

```js
const [editManholes, setEditManholes] = useState([])  // جميع المنهولات (قديمة + جديدة)
const [editPipes, setEditPipes] = useState([])         // جميع الأنابيب (قديمة + جديدة)
const [editTool, setEditTool] = useState(null)          // الأداة النشطة: manhole|pipe|delete|property
const [pipeStart, setPipeStart] = useState(null)        // index المنهول الأول عند رسم أنبوب
const [dialogData, setDialogData] = useState(null)      // بيانات نافذة التعديل
```

**المنهول الجديد** يُضاف مع `_isNew: true` للتمييز عن المنهولات الأصلية:

```js
{
  id: 'N45', ct: '', cr: '', pp: '',
  x: 0, y: 0,           // إحداثيات DXF (تحتاج حساب عند الحفظ)
  lat: 36.5, lng: 3.0,  // إحداثيات الخريطة (تستخدم للعرض)
  _isNew: true,
}
```

**الأنبوب الجديد** يُضاف مع `_isNew: true`:

```js
{
  fromNode: 'N45', toNode: 'R1',
  diam: 315, material: 'PVC',
  start: { x: 790200, y: 2170100 },
  end:   { x: 790250, y: 2170150 },
  _isNew: true,
}
```

## 2. تحليل DXF (dxfParser.js)

### الطبقات المستهدفة

| الطبقة في DXF | المحتوى | كيف تستخرج |
|--------------|---------|-----------|
| `EU 1_Regards` | مواقع المنهولات (INSERT) | `entities.filter(e => e.layer === 'EU 1_Regards' && e.type === 'INSERT')` |
| `EU 1_Regards_Habillage` | نصوص MTEXT: ID, CT, CR, PP | `split('\\P')` → استخراج `R1`, `CT: 433.05`, `CR: 430.75`, `PP: 2.30` |
| `EU 1_Canalisations` | خطوط الأنابيب (LWPOLYLINE) | مع تطبيق فلتر إحداثيات تكيفي |
| `EU 1_Canalisations_Habillage` | تسميات الأنابيب (TEXT) | regex: `مادة-قطر طول` و `انحدار% اتجاه` |
| `EU 1_PL_*_Textes` | المقاطع الطولية (تُكتشف تلقائياً) | نصوص المقاطع → جداول المسافات والمناسيب |

### مطابقة المنهولات

```
EU 1_Regards_Habillage (MTEXT)     EU 1_Regards (INSERT)
     │                                      │
     └─────────── مطابقة بقرب Y + مسافة < 300 ──────→ matched[]
                                                    │
                                                    ▼
                                            enrichedManholes[]
                                            (دمج بيانات profile إن وجدت)
```

### المقطع الطولي → قطع أنابيب فردية

```
جدول Distances cumulées: [0, 25.3, 52.1, 80.0, ...]
جدول Numéros des regards: [R1, R2, R3, R4, ...]
جدول Cotes fil d'eau: [430.75, 429.50, 428.20, 427.00, ...]

لكل زوج متتالي من المسافات:
  • R1→R2: طول = 25.3m, انحدار = (429.50-430.75)/25.3 = -4.9%
  • R2→R3: طول = 26.8m, انحدار = (428.20-429.50)/26.8 = -4.85%
```

## 3. التحويل بين الإحداثيات (proj4)

```
DXF (متر)  ──proj4(crs, 'EPSG:4326')──→  خريطة (lat/lng)
خريطة (lat/lng)  ──proj4('EPSG:4326', crs)──→  DXF (متر)
```

الدالتان في MapView.jsx:

```js
function toLatLng(x, y, crsCode) {     // DXF → خريطة
  const t = proj4(crsCode, 'EPSG:4326', [x, y])
  return { lat: t[1], lng: t[0] }
}

function toDxfCoord(lat, lng, crsCode) { // خريطة → DXF
  const t = proj4('EPSG:4326', crsCode, [lng, lat])
  return { x: t[0], y: t[1] }
}
```

## 4. أدوات التحرير

### إضافة منهول (➕ Regard)

```
1. المستخدم يختار أداة "manhole"
2. ينقر على الخريطة
3. useMapEvents تلتقط click وتُنشئ كائن منهول جديد:
   { id: `N${nextId}`, ct: '', cr: '', pp: '', x: 0, y: 0,
     lat: e.latlng.lat, lng: e.latlng.lng, _isNew: true }
4. تُضاف إلى editManholes[] وتُفتح نافذة dialogData لإدخال ID/CT/CR/PP
5. useEffect يعيد رسم كل المنهولات:
   - المنهولات الأصلية → برتقالي (#e67e22)
   - المنهولات الجديدة → أخضر (#28a745)
   - المنهول المحدد → أصفر (#ffc107)
```

### إضافة أنبوب (➡ Tuyau)

```
1. المستخدم يختار أداة "pipe"
2. ينقر على المنهول الأول → يُخزّن pipeStart = index → يتحول للأصفر
3. ينقر على المنهول الثاني (pipeStart !== idx):
   a. يأخذ إحداثيات DXF لكلا المنهولين:
      - إن كان _isNew → toDxfCoord(lat, lng, crsCode)
      - وإلا → { x: m.x, y: m.y }
   b. يُنشئ كائن أنبوب ويُضيفه إلى editPipes[]
4. useEffect يرسم الأنابيب الجديدة كخطوط خضراء متقطعة
```

### حذف عنصر (🗑 Suppr)

```
1. المستخدم يختار أداة "delete"
2. ينقر على الخريطة → findNearest(e.latlng) تبحث عن أقرب منهول
3. المسافة محسوبة بالبكسل (وليس بالدرجات) عبر map.latLngToContainerPoint()
4. threshold = 25px
5. إذا وُجد منهول قريب → يُحذف من editManholes[]
   وجميع الأنابيب المتصلة به (fromNode أو toNode) تُحذف من editPipes[]
```

### تعديل الخصائص (✏ Prop)

```
1. المستخدم يختار أداة "property"
2. ينقر على المنهول → setDialogData({ type: 'manhole', index, id, ct, cr, pp })
3. يُفتح overlay مع حقول editable (ID, CT, CR, PP)
4. كل تغيير في input يُحدّث مباشرة editManholes[index] عبر onChange
5. زر "Delete" في النافذة يحذف المنهول والأنابيب المتصلة
6. زر "Close" يُغلق النافذة فقط
```

## 5. حفظ DXF (dxfWriter.js)

### toDxfString(data, options)

يُولّد نص DXF صالحاً بالكامل:

```
HEADER
  $ACADVER → AC1009
  $DWGCODEPAGE → ANSI_1252   ← مهم للحفاظ على الأحرف المركبة (é, è, à, etc.)
  $INSBASE → (0,0,0)

TABLES
  LAYER: 0, EU 1_Regards, EU 1_Canalisations, EU 1_Regards_Habillage
```

### ترميز الأحرف (Latin-1/ANSI-1252)

- ملفات CovoDadis تستخدم ترميز Latin-1 (Windows-1252) للأحرف الفرنسية
- `DxfUploader.jsx` يقرأ الملف بترميز `iso-8859-1` لتفادي حدوث أخطاء الترميز
- `proxyGraphicParser.js` يستخدم `iso-8859-1` لقراءة النصوص داخل الرسومات الوكيلة
- `NetworkEditor.jsx` يُنشئ `Blob` مع ترميز `encodeToLatin1()` لحفظ الملف بحالته الأصلية
- عند فشل قراءة النص بترميcodf UTF-8، تُستبدل الأحرف غير الصالحة بـ U+FFFD (�)

ENTITIES
  لكل منهول → INSERT (block=REGARD, layer=EU 1_Regards)
  لكل أنبوب → LWPOLYLINE (layer=EU 1_Canalisations, 2 vertices)
  لكل منهول → MTEXT (layer=EU 1_Regards_Habillage)
    النص: "ID\PCT : CT\PCR : CR\PP : PP"
```

معالجة المنهولات الجديدة عند الحفظ:

```js
const finalManholes = editManholes.map(m =>
  m._isNew
    ? { ...m, x: toDxfCoord(m.lat, m.lng, crsCode).x, y: toDxfCoord(m.lat, m.lng, crsCode).y }
    : m  // المنهولات القديمة تحتفظ بإحداثياتها الأصلية
)
```

إصدار الملف:

```js
const blob = new Blob([dxf], { type: 'application/dxf' })
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url; a.download = 'edited_network.dxf'; a.click()
URL.revokeObjectURL(url)
```

## 6. دورة حياة المكون (Component Lifecycle)

### الخطوة الأولى — تحميل البيانات

```js
useEffect(() => {
  if (data && !editInitialized) {
    setEditManholes(data.manholes.map(m => ({ ...m })))   // نسخ المنهولات
    setEditPipes(data.profileSegments.map(s => ({ ...s }))) // نسخ الأنابيب
    setEditInitialized(true)
  }
}, [data, editInitialized])
```

### الخطوة الثانية — التبديل إلى وضع التحرير

```js
const toggleEdit = () => {
  if (editMode) {
    setEditMode(false); setEditTool(null); setDialogData(null); setPipeStart(null)
  } else {
    setEditMode(true); setEditTool('manhole'); setPipeStart(null)
  }
}
```

### الخطوة الثالثة — العرض المتزامن

EditInteraction تحتوي على useEffect يُعيد رسم المنهولات والأنابيب كلما تغيرت editManholes/editPipes/pipeStart. عند إعادة التحميل (unmount) يُنظّف كل Layer من الخريطة:

```js
return () => { markers.forEach(m => m.remove()) }
```

## 7. ملخص: رحلة التعديل الكاملة

```
رفع DXF → parseCovadisDxf()
         ↓
    data.manholes[ ] ← إحداثيات DXF (x, y)
    data.profileSegments[ ] ← إحداثيات DXF (start/end)
         ↓
    toLatLng() يحوّل الإحداثيات إلى lat/lng
         ↓
    عرض على Leaflet: profileSegments → خطوط, manholes → نقاط
         ↓
    المستخدم ينقر "✎ Edit"
         ↓
    editManholes = نسخة من data.manholes
    editPipes = نسخة من data.profileSegments
         ↓
    أدوات: ➕ إضافة / ➡ توصيل / 🗑 حذف / ✏ تعديل
         ↓
    حالة editManholes/editPipes تتغير
         ↓
    useEffect يُعيد رسم Layer التحرير فوق الخريطة
         ↓
    المستخدم ينقر 💾 Save DXF
         ↓
    toDxfString(): { manholes, segments } → نص DXF
    المنهولات الجديدة (_isNew) تُحوّل lat/lng → DXF عبر toDxfCoord()
         ↓
    Blob → download → edited_network.dxf
```

## 8. الفروقات بين "قديم" و "جديد"

| الخاصية | المنهول القديم (من DXF) | المنهول الجديد (أضافه المستخدم) |
|---------|------------------------|-------------------------------|
| `_isNew` | `undefined` أو غير موجود | `true` |
| `x, y` | إحداثيات DXF حقيقية | `0, 0` (تحسب عند الحفظ) |
| `lat, lng` | غير موجودة (تحسب من x,y وقت العرض) | موجودة (من click على الخريطة) |
| اللون على الخريطة | برتقالي (`#e67e22`) | أخضر (`#28a745`) |

| الخاصية | الأنبوب القديم | الأنبوب الجديد |
|---------|---------------|----------------|
| `_isNew` | غير موجود | `true` |
| `fromNode` | معرف من المقطع الطولي (مثل `R1`) | معرف منهول جديد (مثل `N45`) |
| اللون على الخريطة | سميك متصل (حسب القطر) | أخضر متقطع (`dashArray: '8 4'`) |
