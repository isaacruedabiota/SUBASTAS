# SUBASTAS — agregador personal de subastas públicas españolas

## Qué es esto

Herramienta **de uso personal, no publicada**, para consultar subastas públicas del
territorio español. Tres objetivos, en orden de importancia:

1. **Estado actual** de una subasta (activa, pujas, importes, fechas).
2. **Histórico**: cómo han ido las subastas cerradas (adjudicación vs. tasación,
   desiertas, evolución por provincia/tipo).
3. **Enriquecimiento del inmueble** — el motivo real del proyecto. La ficha oficial del
   Portal de Subastas es pobre; aquí se cruza con Catastro y datos geográficos.

No hay pujas propias, ni pagos, ni multiusuario, ni publicación en tiendas de apps.

## Stack

- **Monorepo** Turborepo + npm workspaces, TypeScript en todo.
- **Web**: Next.js 16 (App Router) — `apps/web`
- **Móvil**: Expo 57 / React Native — `apps/mobile` (se corre en Expo Go, sin publicar)
- **Datos**: **SQLite** vía `node:sqlite`, integrado en Node 24 — `packages/db`
- **Ingesta**: workers TypeScript en `packages/ingest`, a mano o por cron

### Sin servicios cloud, a propósito

No hay Firebase, ni Typesense, ni BigQuery, ni ninguna API de pago. Se evaluaron y se
descartaron: para un único usuario y una app que no se publica, añadían cuentas, cuotas y
dependencias sin resolver nada que SQLite no resuelva ya.

SQLite cubre los tres patrones de consulta del proyecto, verificado antes de decidirlo:

- **Filtros multi-rango** (precio **y** superficie **y** fecha) — nativos en SQL.
- **Búsqueda de texto** — tabla virtual **FTS5** `busqueda`, con `remove_diacritics`.
- **Agregados del histórico** (medias, ratios, series) — `GROUP BY` normal y corriente.

`node:sqlite` viene incluido en Node ≥22: **sin dependencias nativas y sin compilar nada**,
lo que evita el clásico problema de `better-sqlite3` con node-gyp en Windows.

Matiz honesto: las **notificaciones push** salen por los servidores de Google (FCM) o de
Apple, porque son los únicos que pueden despertar un móvil. No es una excepción a la regla
—no hay proyecto de Firebase, ni clave, ni cuenta, ni coste; las claves VAPID se generan
solas y el mensaje va cifrado extremo a extremo, así que esos servidores lo transportan sin
poder leerlo— pero conviene saberlo antes de leer «sin servicios cloud» al pie de la letra.

## Fuentes de datos

| Fuente | Qué aporta | Acceso | Estado legal |
|---|---|---|---|
| **API datos abiertos BOE** | **Catálogo completo** de subastas: identificador `SUB-*`, órgano, localidad, NIG, enlace al Portal | REST, `boe.es/datosabiertos` | Reutilización permitida (Ley 37/2007) |
| **Catastro OVC** | Superficie, año, uso, coordenadas, plano | SOAP/REST, `ovc.catastro.meh.es` | Servicios libres y gratuitos |
| **Portal de Subastas** | Detalle del bien y estado de la puja | HTML | ⚠️ `robots.txt` = `Disallow: /` — ver abajo |

Ninguna de las dos primeras es HTML: **no requieren scraping**. Por eso no hay Firecrawl.

### Lo que el BOE sí da (verificado con datos reales)

El diario BOE **es el índice oficial del Portal de Subastas**. Cada subasta tiene su
anuncio con el enlace directo:

```
Dirección electrónica: https://subastas.boe.es/ds.php?id=SUB-JA-2026-264971
```

Medido sobre una semana real (22–28 jul 2026): **94 subastas del Portal**, 87 `SUB-JA`
(judiciales) y 7 `SUB-JV`. Las de la AEAT (`SUB-AT`) llegan en tandas: 173 en un solo día
(4 jul). El catálogo completo se puede construir por vía oficial, sin tocar el Portal.

**Dos trampas que costaron encontrar, no las repitas:**

1. **El identificador NO es numérico.** La AEAT usa sufijos alfanuméricos:
   `SUB-AT-2026-26R4586001001`. El patrón correcto es `SUB-[A-Z]{2}-\d{4}-[A-Z0-9]+`.
2. **Filtrar por título pierde TODAS las judiciales.** Los edictos de la sección 4 se
   titulan con el partido judicial ("DOS HERMANAS", "SEVILLA") y no dicen "subasta" en
   ninguna parte; el `SUB-JA-*` solo está en el cuerpo. Por eso las secciones `4` y `5C`
   se descargan enteras (`SECCIONES_COMPLETAS`) y la detección es **por texto**.

También hay que descartar ruido que sí dice "subasta": Deuda del Estado (Obligaciones,
Letras, Bonos), derecho de tanteo sobre lotes de arte, y adjudicación de contratos.

### Lo que el BOE NO da

Los edictos judiciales son escuetos (266–317 caracteres): órgano, NIG y enlace. **Nada del
inmueble.** Dirección, tasación, cargas, situación posesoria, referencia catastral y estado
de la puja existen únicamente en la ficha del Portal.

Consecuencia para el objetivo nº 3 (enriquecimiento): Catastro necesita la referencia
catastral, que en las judiciales no viene del BOE. Sin el Portal, el enriquecimiento solo
alcanza a los pocos anuncios que la traen en el cuerpo (5 de 184 en el mes medido).

### Catastro (OVC) — el enriquecimiento

Servicios libres y gratuitos, sin clave. Devuelven exactamente lo que el Portal no da:
superficie, año, uso, tipo de finca, coordenadas y enlace al plano.

**Tres trampas, todas descubiertas a base de sondas:**

1. **El parámetro se llama `RefCat`, no `RC`.** Con `RC` responde HTTP 200 y un error 17
   "LA REFERENCIA CATASTRAL ES OBLIGATORIA", que despista muchísimo.
2. **Las coordenadas van en otro servicio** (`OVCCoordenadas.asmx`, XML) y exigen la
   referencia de **14 posiciones**, no la de 20. Hay que truncar.
3. **La respuesta cambia de forma según la finca.** Urbana (`cn: "UR"`) trae
   calle/planta/puerta y superficie construida; rústica (`cn: "RU"`) trae
   polígono/parcela/paraje y **superficie construida 0**: la que importa es la del suelo.
   Mostrar siempre `sfc` daba "0 m²" en una finca de 526.978 m².

Validación cruzada que confirma que el cruce funciona: un anuncio del BOE decía
*"superficie de 3.931 m2"* y Catastro devolvió `ss: 3931` para esa referencia.

### El Portal SÍ publica fotos del inmueble

Se descubrió tarde, buscando en el HTML ya cacheado. Además de las tablas de
datos, la ficha puede traer:

```html
<h5 class="legend">Imágenes y fotografías</h5>
  <a href="verDocumento.php?idSub=..&idDoc=..">
    <img src="verThumbnail.php?idSub=..&idDoc=.." alt="Vista fachada"/>
```

**Es la única fotografía del bien que existe en una fuente oficial.** Los
títulos son descriptivos: "Vista fachada", "Vista aérea ubicación", "Mapa
cartográfico". Medido sobre 740 subastas leídas:

| | Subastas | % |
|---|---:|---:|
| Con fotos | 34 | 5% |
| Con documentos PDF | 623 | 84% |

**Quién pone fotos no es aleatorio, es organizativo.** Medido sobre 844 fichas:

| Autoridad gestora | Leídas | Con fotos |
|---|---:|---:|
| **Unidad de Subastas Judiciales Región de Murcia** | 29 | **29 (100%)** |
| U.R. SUBASTAS CATALUÑA (AEAT) | 37 | 0 |
| Servicio de Gestión Subastas de València | 36 | 0 |
| U.R. SUBASTAS ANDALUCIA 41 (AEAT) | 28 | 0 |

La unidad de Murcia las pone **siempre**; casi nadie más las pone nunca. Por eso
32 de las 50 subastas de Murcia tienen fotos y el resto del país apenas ninguna.
Buscar "subastas con foto" es, en la práctica, buscar subastas de Murcia.

El catálogo tiene filtro `?fotos=1` y distintivo con el número de fotos.

Pocas fotos, pero los **documentos** son otra cosa: entre ellos aparece la
**certificación de cargas**, que es justo el dato que la ficha deja en «no
consta» y lo que más caro sale ignorar. También nota simple y edicto.

- **⚠️ NO están en la pestaña de bienes**, que es donde parecía lógico buscarlos
  y donde los busqué primero. De las 34 subastas con fotos, **31 las traen en
  `ver=1` (datos)** y solo 3 en `ver=3`; los PDF salen repartidos por varias
  pestañas. Buscar solo en bienes hacía que las fichas nuevas guardaran cero
  adjuntos mientras el reparseo de caché —que mira todos los ficheros— sí los
  encontraba: los dos caminos daban resultados distintos y el bueno era el que
  no se usaba en producción. `obtenerFichaSubasta` escanea **todas** las
  pestañas que ya descarga.
- Los metadatos **no cuestan ninguna petición**: están en HTML que ya se
  descargaba. Se extraen con `parsearAdjuntos`.
- Las imágenes se bajan **al abrir la ficha en la web** (Server Action
  `descargarFotos`, con huecos girando mientras llegan) o por lotes con
  `npm run fotos`. Ambos caminos llaman a la misma `descargarFotosDe`, para que
  no puedan divergir como pasó con el escaneo de pestañas. Lo ya descargado no
  se vuelve a pedir: la segunda visita no genera tráfico.
- Los PDF **no se descargan**: se enlazan al Portal. Ahorra tráfico y son
  documentos que conviene mirar en su fuente.
- Para las fichas leídas antes de que existiera el parser, `npm run readjuntos`
  las rellena releyendo la caché local, **sin red**.

### ⚠️ Los argumentos de `npm run` desde la raíz: hace falta `--` al final

`npm run precargar -- --limite 200` **no limitaba nada**. npm se come los flags
y solo pasa sus valores: el script recibía `["200","5000"]` en vez de
`["--limite","200","--espera","5000"]`, así que `argumento('limite')` devolvía
`undefined` y el límite se quedaba en `Infinity` — un recorrido sin tope de un
sitio con `Disallow`, justo lo contrario de lo que uno cree estar pidiendo.

Se arregla con un `--` al final del script de la raíz:

```json
"precargar": "npm run precargar --workspace=@subastas/ingest --"
```

Todos los scripts que aceptan argumentos lo llevan. Si añades otro, no lo
olvides, y compruébalo imprimiendo `process.argv`.

### Vista de calle — dos fuentes con reglas opuestas

El apartado «Ubicación y vista de calle» sale con coordenadas de Catastro si las
hay y, si no, **con la dirección en texto del Portal**: la API de Street View
acepta una dirección en `location=` igual que un punto, así que no hace falta
geocodificar nada. Es lo que sube la cobertura del 48% al 91%:

| | Fichas | % |
|---|---:|---:|
| Con coordenadas (Catastro) | 416 | 48% |
| **Con coordenadas o dirección** | **786** | **91%** |

La dirección es menos fiable —puede caer en otro portal o en otra calle del
mismo nombre— y la ficha lo dice expresamente. Dos detalles del modo dirección:
`radius` no se envía (acotarlo descarta la panorámica que Google ya eligió) y el
botón de «Street View interactivo» se oculta, porque `map_action=pano` exige
`viewpoint` en coordenadas y con una dirección no funciona.

| Fuente | Cobertura | ¿Se puede guardar? | Clave |
|---|---|---|---|
| **Google Street View** | casi total | **NO** — lo prohíben sus términos | Google Cloud, con facturación |
| **Mapillary** | buena en ciudad, floja fuera | **SÍ** — CC-BY-SA 4.0 | token gratis, sin tarjeta |

Por eso cada una se trata de forma distinta, y esa asimetría es deliberada:

- **El visor navegable va empotrado** (`<iframe>` de la Maps Embed API) cuando
  hay coordenadas y clave de embed. Además de ser lo cómodo, evita el visor en
  negro que sale a veces al abrir Google en otra pestaña — su WebGL arranca mal
  y solo se cura recargando. **Su clave viaja al navegador** (un iframe no se
  puede proxear): usa una distinta de la del proxy y restringida por referente,
  de ahí el prefijo `NEXT_PUBLIC_`. La Embed API **no acepta direcciones** en
  modo streetview, así que sin coordenadas se cae a la imagen estática.
- Street View estático se pide **en vivo** a `/api/streetview`, que hace de proxy. Dos
  razones: la clave no aparece en el HTML, y el proxy consulta antes el
  endpoint de **metadatos** (gratuito) para saber si hay panorámica. Sin esa
  comprobación Google devuelve una imagen gris de "no imagery" que en la ficha
  parece un fallo. Si no hay, responde 404 y el panel desaparece solo.
- Mapillary se **descarga** con `npm run calles` y queda en `data/calle/`,
  servida por `/api/calle/[archivo]`. La atribución al autor es obligatoria y
  se pinta bajo la foto. Su **visor navegable también va empotrado** cuando hay
  foto (`mapillary.com/embed?image_key=…`), y ese no pide clave ninguna.
  Cobertura medida con el token puesto: **27 de 77 ubicaciones consultadas (~34%)**.

**⚠️ Google no se puede empotrar sin clave, y no hay atajo.** Sus URL antiguas de
iframe (`maps.google.com/maps?…&output=embed`) responden
`X-Frame-Options: SAMEORIGIN`: el navegador las bloquea, sin aviso útil. Las dos
alternativas que sí se empotran a coste cero ya están puestas en la ficha:
**Leaflet + OpenStreetMap** para el mapa (`mini-mapa.tsx`, mismo planteamiento
que el mapa grande, con `scrollWheelZoom: false` para no secuestrar el scroll) y
el visor de Mapillary para el nivel de calle. El visor de Mapillary deja dos
errores de consola pidiendo permiso de WebXR; son suyos y cosméticos — silenciarlos
exigiría una cabecera `Permissions-Policy` global y no compensa.

Detalles que cuestan encontrar:

- La búsqueda por `radius` de Mapillary **está topada en 50 m**, muy poco para
  el centroide de una parcela. Se usa `bbox`, cuyo lado debe medir menos de
  0,01 grados, y se ordena por distancia a mano (`fotoMasCercana`).
- El handler de `/api/calle` **valida el nombre con una regex** antes de tocar
  el disco. Sin eso, un `..%2F..%2Fsubastas.db` se sale de `data/calle`.
- **Todo esto es opcional.** Sin ninguna clave la ficha muestra los enlaces a
  Google Maps y a Street View, que no necesitan nada.
- La coordenada es el **centroide de la parcela**, no el portal: en fincas
  grandes la foto cae lejos del inmueble. La ficha lo advierte.

### Ortofoto del IGN (PNOA) — la tercera vía de imagen

Para las **440 subastas con coordenadas y sin fotos del Portal**, la ficha
genera un bloque «Vistas del entorno»: dos ortofotos aéreas (parcela y entorno)
y, si hay clave, dos vistas de calle (encuadre normal y `fov=120` para
contexto). Con fotos reales del Portal el bloque no aparece: mandan aquellas.

**En el listado cada fila lleva un carrusel** con tres capas, de mejor a peor:
fotos del Portal ya descargadas → ortofoto (parcela y entorno) → marcador
dibujado. Sobre 60 filas en curso: 23 con imagen real y 37 con marcador, frente
a las 6 que salían antes. Dos detalles que condicionan el diseño:

- La tarjeta **no puede ser un `<a>` envolviéndolo todo**, porque el carrusel
  lleva botones y HTML no admite controles dentro de un enlace. El título estira
  su `::after` sobre la tarjeta (patrón *stretched link*) y las flechas van por
  encima con `z-10`; hay que frenar el evento con `preventDefault` o pasar de
  imagen navegaría a la ficha.
- `/api/satelite` **serializa sus peticiones al IGN** (400 ms entre ellas). Sin
  eso, un listado de 60 filas dispara 30 peticiones simultáneas contra un
  servicio público gratuito. Con `loading="lazy"` solo se piden las visibles.

El WMS del IGN es la mejor fuente de imagen del proyecto y llegó la última:

- Gratuito, oficial y **sin clave**, a diferencia de la satelital de Google.
- **Se puede guardar** (datos abiertos, citando la fuente), así que
  `/api/satelite` cachea en `data/satelite/` al primer visionado: la segunda
  visita responde en ~9 ms sin tocar el IGN.
- Cubre el **100% del territorio**, también el rústico donde no existe ninguna
  vista de calle. Es lo único que funciona siempre.

**⚠️ WMS 1.3.0 con EPSG:4326 quiere el BBOX en orden `lat,lon`** — al revés que
casi todo lo demás, que va `lon,lat`. Invertirlo devuelve un recorte del mar sin
dar ningún error. Y ante un fallo el WMS responde **200 con un XML**, así que
hay que comprobar los bytes (`FF D8` de JPEG), no el código de estado.

### ⚠️ Sobre subastas.boe.es — consulta bajo demanda

`subastas.boe.es/robots.txt` es `User-agent: * / Disallow: /`.

**Decisión tomada: no se rastrea el Portal.** La ficha de una subasta se consulta
*únicamente* cuando el usuario abre esa subasta concreta en la app, y se cachea. Es una
petición por subasta efectivamente mirada, equivalente a abrirla en el navegador — no hay
recorrido sistemático del sitio.

Reglas del módulo (`packages/ingest/src/sources/portal-subastas/`):

- **No existe ninguna función que recorra el catálogo, y no debe añadirse.** La API
  pública es `obtenerFichaSubasta(id)`: una subasta, por identificador.
- Desactivable por completo con `INGEST_PORTAL_ENABLED=false`.
- Rate limit e identificación via `packages/ingest/src/http.ts`, que serializa por host.
- Caché en disco con vigencia de un día (`data/cache/portal`): no se repite una petición
  ya hecha hoy, y el desarrollo del parser no genera tráfico.
- Datos de consulta personal; **no se redistribuyen**.

De esa ficha sale la referencia catastral, que es lo que dispara el enriquecimiento.

### Estructura de la ficha del Portal

Cuatro pestañas de `detalleSubasta.php?idSub=<ID>&ver=<N>`:

| `ver` | Contenido |
|---|---|
| 1 | Datos de la subasta: tipo, expediente, fechas, tasación, valor, depósito, tramos |
| 2 | Autoridad gestora: código, descripción, dirección, teléfono, correo |
| 3 | Bienes: descripción, **referencia catastral**, IDUFIR, dirección, cargas, título |
| 5 | Pujas: puja máxima y banner de estado |

**⚠️ Subastas con lotes: los importes NO están en la pestaña general.** Si la ficha
declara `Lotes: N` (en vez de "Sin lotes"), la adjudicación es separada y la pestaña
general pone literalmente *"Ver valor de subasta en cada lote"*. Cada lote tiene su
propia página en `ver=3&idLote=N` con **sus** valor de salida, tasación y depósito.
Leer solo la general dejaba esas subastas sin ningún importe.

En el modelo, una subasta sin lotes es un lote implícito nº 1 cuyos importes son los de
la subasta; los importes a nivel de subasta se calculan sumando los lotes (`agregado()`),
que es lo que costaría llevárselo todo.

Todas las pestañas usan `<tr><th>Etiqueta</th><td>Valor</td></tr>`, salvo una excepción:

- **La pestaña de pujas no siempre usa tabla.** En las subastas concluidas el importe va
  en texto plano y la etiqueta cambia ("Puja máxima **actual** de la subasta" mientras
  está en curso, "Puja máxima de la subasta" ya concluida). Parsear solo tablas perdía
  la puja. `parsearPujas` trabaja sobre el texto.
- Las fechas vienen con su ISO al lado (`(ISO: 2026-07-28T18:00:00+02:00)`): se usa ese,
  que ya trae el offset.
- **La riqueza varía muchísimo por organismo.** Las de la AEAT traen referencia catastral,
  IDUFIR, cargas con importe, inscripción registral y detalle de hipotecas; las judiciales
  a menudo solo descripción y dirección, **sin referencia catastral** — y entonces no hay
  enriquecimiento posible.
- `cargas = null` significa "el Portal no lo informó", **nunca** "libre de cargas". Al
  mostrarlo hay que decir "no consta". Lo mismo con `situacionPosesoria`.
- **⚠️ El campo de cargas unas veces es una cifra y otras es prosa**, y eso rompió
  el importe de dos maneras. `parseImporteES` borra lo no numérico y pega los
  dígitos que quedan: sirve en una celda que ya es un importe, pero sobre texto
  libre juntaba expedientes y fechas — *"D.P. 1162/2019 … año 2025"* salía como
  **2.025.311.622.019 €**. Y al revés, *"Ver certificación de cargas."* dejaba el
  residuo `"."`, que sin puntos es `""`, y `Number("")` es **0**: "consúltalo"
  quedaba guardado como *cero euros de cargas*, la lectura opuesta a la buena.
  Para este campo va `parseImporteEstricto`, que solo acepta que **todo** el
  texto sea una cifra y devuelve `null` en cuanto hay prosa.
- Una tasación de `0,00 €` en un lote es "no informada", no un inmueble que no vale nada.
  **La ficha lo mostraba tal cual, y son 588 de 1.291** — casi la mitad del catálogo leído
  anunciando un inmueble que no vale nada. Ahora sale "No consta".
- **⚠️ «Sin puja mínima» NO es «no consta»: es lo contrario.** Es el campo que responde
  a *«¿cuánto tengo que pujar como mínimo?»*, y sin cifra quedaba en `NULL` igual que un
  dato no informado. Medido sobre las 1.630 fichas leídas:

  | Texto del Portal | Nº | Significa |
  |---|---:|---|
  | `Sin puja mínima` | **983** | **no hay suelo**: se admite cualquier puja |
  | una cifra | 482 | por debajo no se admite |
  | `Ver puja mínima de cada lote` | 165 | va por lote, no en la general |

  O sea que la ficha decía «No consta» en 983 subastas donde el Portal afirma
  expresamente que no hay mínimo. `puja_minima_situacion` lo distingue
  (`IMPORTE`/`SIN_MINIMA`/`POR_LOTE`) y `npm run reminimas` lo rellena desde la caché,
  **sin red**. Ojo: el suelo real de una subasta sin puja mínima lo pone el **depósito**
  (5%), no el valor de salida.
- **Sin fechas no se puede afirmar que esté en curso.** El Portal publica la ficha en
  cuanto se anuncia, antes de fijar calendario. Esas van a `PROXIMA_APERTURA`.
- Hay campos tras "Información complementaria" que exigen iniciar sesión. No se usan.

### ⚠️ La puja: el Portal NO publica el importe mientras la subasta está viva

El valor que representa «la puja actual» es la **puja máxima** de la pestaña `ver=5`
(`estado_puja.puja_maxima`, última captura). Pero solo existe **una vez concluida**.
Medido sobre las 262 pestañas cacheadas de subastas en curso: **cero traen cifra**.
Lo que traen es una de estas tres frases:

| Frase del Portal | Medido | `situacion` | Significa |
|---|---:|---|---|
| «La subasta no ha recibido pujas.» | 218 | `SIN_PUJAS` | consta que NO hay |
| «La subasta ha recibido alguna puja. Para ver su importe…» | 43 | `OCULTA` | **SÍ hay**, importe reservado a registrados |
| «La puja máxima de la subasta es secreta.» | 1 | `SECRETA` | no se dirá |
| (con cifra, ya concluida) | 592 | `CONOCIDA` | importe publicado |

**El fallo que esto arregla:** solo se guardaba el importe, así que las 44 con pujas
declaradas quedaban en `NULL` igual que las vacías y la ficha ponía **«Sin pujas»** en
subastas que el Portal dice expresamente que las tienen. Es el mismo error que decir
"libre de cargas" cuando el dato solo es que no consta — y aquí además invierte la
lectura de una subasta viva. Ahora `parsearPujas` devuelve `situacionPuja` y la
interfaz solo dice "Sin pujas" cuando el Portal lo dice.

Las 44 sin cifra **no llegaban a tener fila** en `estado_puja` (la escritura antigua
exigía importe o texto). `npm run repujas` las rellena releyendo la caché, **sin red**,
igual que `readjuntos`.

#### Ver el importe en vivo: sesión de usuario registrado

El importe **no está en el HTML** para un visitante anónimo: no es que esté oculto con
CSS ni en una variable de JavaScript, es que el Portal no lo envía. No hay parseo que lo
saque — o hay sesión, o no hay importe. Con sesión sí aparece, y en curso:

```
Importe de la puja más alta en esta subasta: 84.938,88 €
```

**⚠️ El login es de DOS FACTORES: no puede ser desatendido.** Tras `usuario` y
`password` (POST a `/id/login.php`, **sin token CSRF**), el Portal manda un código al
correo **y** al móvil y pide un `codVerif`. El estado del login a medias viaja en campos
ocultos (`usuario`, `password` ya cifrada, `idUsuario`), **sin cookie**, así que el
segundo paso se puede completar desde otro proceso. Cada intento **invalida el código
anterior**: no llamar al paso 1 en bucle.

Registrarse exige Cl@ve o certificado (`infoRegistro.php`), pero del alta salen un
usuario y una contraseña, que son los de `.env`. `acceso.php` es solo el selector.

```bash
npm run entrar                    # interactivo: pide el código por consola
npm run entrar -- --paso1         # envía el código y guarda el estado
npm run entrar -- --codigo ABC123 # completa el paso1 anterior
npm run entrar -- --cuenta 2      # con varias cuentas, cuál
```

…o **desde la web, en `/cuenta`**, que es lo cómodo: botón «Iniciar sesión», llega el
código al móvil, se teclea y ya.

#### Las cuentas viven en la BD, no en `.env` (migración 015)

`cuentas_portal` guarda usuario, contraseña, cookie de sesión y el login a medias. El
`.env` **solo se mira la primera vez**: si no hay ninguna cuenta guardada,
`adoptarHerencia()` importa `PORTAL_USUARIO`/`PORTAL_CLAVE` y la sesión que hubiera en
`data/sesion-portal.json`. A partir de ahí manda la BD y esos dos sitios dejan de leerse
(el fichero antiguo no se borra, simplemente se ignora).

Tres cosas que esto arregla y no son obvias:

- **El paso 1 y el paso 2 pueden ocurrir en procesos distintos.** El Portal no da cookie
  entre medias —todo el estado va en campos ocultos del formulario—, así que guardarlo en
  `cuentas_portal.pendiente` es lo que permite pedir el código desde el navegador y
  canjearlo desde donde sea.
- **Web y CLI ven la misma sesión sin ponerse de acuerdo.** SQLite en WAL los sincroniza;
  un JSON leído en memoria al arrancar, no. Por eso `cookieDeSesion()` **no memoiza**: una
  cookie cacheada dejaría al servidor web usando la que la consola acaba de renovar.
- **Los fallos no se lanzan, se guardan.** Las acciones de `/cuenta` son `<form action=…>`
  normales, que funcionan sin JavaScript y no tienen por dónde devolver un mensaje. El
  error va a `cuentas_portal.ultimo_error` y la página lo pinta junto a la cuenta.

⚠️ **La contraseña se guarda en claro**, igual que estaba en `.env`. Lo que cambia es que
ahora es alcanzable desde la web, así que `CuentaPortal` —el tipo que ve la interfaz— **no
lleva ni la contraseña ni la cookie**: solo salen por `credencialesDe()`, que existe para
hacer login y para nada más. El formulario de edición viene vacío, y una clave vacía
significa «no la cambies», nunca «bórrala».

⚠️ **Un diagnóstico que descubre que la sesión ha muerto tiene que tirarla.**
`probar-sesion` detectaba el muro del importe, lo decía por consola y dejaba la cookie
puesta: `/cuenta` seguía anunciando «Sesión abierta» sabiendo que no lo estaba. Es el mismo
error que decir «sin pujas» cuando lo único que consta es que no se ven.

Esto **no** abre la puerta a rastrear el Portal: sigue habiendo lectura por
identificador y sigue pasando por la cola de `http.ts`. Lo único que cambia es que las
peticiones van identificadas.

Tres cosas que se comprobaron contra el Portal real y no son obvias:

- **⚠️ La cabecera NO sirve para detectar la sesión.** Lo natural parecía mirar el botón
  «Iniciar sesión» (`botonAcceso`, presente en las 5.818 páginas cacheadas), pero
  **sigue estando también con la sesión abierta**. Un reintento basado en ella se
  habría disparado siempre. El disparador bueno es funcional: la frase *«ver su importe
  debe acceder como usuario registrado»* (`importeReservado`), que además no se confunde
  con la caja genérica «Para participar… debe haberse registrado», presente también sin
  pujas. Para afirmar que hay sesión se usa el enlace «Desconectar».
- **Al caducar la sesión no se reintenta**: renovarla exige un código por SMS. Se tira
  la cookie muerta y la ficha se guarda con lo que ve un anónimo, que es la verdad
  («hay pujas, importe reservado»). Nunca «sin pujas».
- **La caché de la pestaña de pujas baja a 15 min, pero SOLO con sesión.** Sin ella el
  importe no va a aparecer por mucho que se relea: sería tráfico regalado a un sitio con
  `Disallow`. El resto de pestañas siguen valiendo un día.

`npm run probar-sesion` comprueba que la sesión sigue viva y **vuelca las secciones de
puja tal cual llegan**: es donde se ve si el Portal ha cambiado la plantilla.

⚠️ `PORTAL_CLAVE` es la contraseña real en un fichero de texto. `.env` está fuera de
git (`.env.example` **no** lo está: no pongas ahí credenciales). El HTML cacheado y
`data/subastas.db` llevan datos de la cuenta; `data/` también está fuera de git.

#### ⚠️ Con lotes, la puja es POR LOTE

Con sesión y varios lotes la pestaña no da una cifra de la subasta, sino la del lote
seleccionado: *«Sin pujas en el lote 1 de esta subasta»*, y cada lote tiene su página
(`&idLote=N`). Son **38 de las 285 subastas en curso (137 lotes)**: guardar la del lote 1
como puja de la subasta habría repetido el error de siempre — atribuir al todo lo que
solo se sabe de una parte.

`estado_puja.lote` guarda a cuál pertenece (NULL = subasta sin lotes separados) y las
consultas suman la última lectura de cada lote, igual que `agregado()` hace con los
importes. `lotesConImporte` frente a `lotes` dice si la suma está completa, y la interfaz
lo enseña («Suma de 1 de 7 lotes; del resto no consta importe»).

Dos trampas del salto de esquema, ya resueltas en `011_pujas_coherentes.sql`: las filas
antiguas con importe pero sin `situacion` son CONOCIDA por definición, y las que tienen
`lote IS NULL` en una subasta con lotes son una cifra que el Portal nunca dio — se
borran, y las consultas las ignoran igualmente si conviven con lecturas por lote.

#### Seguir una subasta viva (`npm run pujas`)

Refresca solo la pestaña de pujas de las subastas en curso: **una petición por lote**,
no la ficha entera. Añade una fila a `estado_puja` por lectura, que para eso es una serie
temporal — así se ve la puja subir. `--frescura` evita releer lo reciente (1 h por
defecto). Sin sesión avisa de que solo sabrá si hay pujas o no.

Dos cosas que sorprenden de los datos y no son un error:

- **La puja ganadora suele estar por DEBAJO del valor de salida**: mediana del **70%**.
  El valor de subasta es el tipo de referencia; lo que acota de verdad es la **puja
  mínima** (en la AEAT, el 10%), y muchas rematan justo en ella. No pintarlo como
  anomalía.
- Los ratios llevan **mediana, no media**: hay remates de 500× (subastas cuyo valor
  general es simbólico porque va por lotes) y la media salía 2,5×, un número que no
  describe a ninguna subasta real.

### Dos regímenes de lectura: el atraso y lo que va llegando

El catálogo no se lee igual entero, y la frontera es **la fecha del anuncio en el BOE**:

| | Qué lee | Peticiones | Comando |
|---|---|---:|---|
| Anunciado **antes de hoy** | ficha COMPLETA (4 pestañas) | 4+ | `npm run precargar` |
| Anunciado **hoy o después** | **BÁSICA**: datos + bienes | 2 | `npm run basicas` |
| Al abrir una BÁSICA en la web | completa lo que falta | 2 | (automático) |

El motivo es de tráfico: cada día entran decenas o cientos de subastas nuevas y casi
ninguna se llega a mirar. Con la lectura básica el listado ya tiene importes, fechas,
dirección, provincia y referencia catastral —o sea, filtros, mapa, Catastro y
ortofoto— por la mitad de peticiones. Autoridad gestora y pujas se leen solo si el
usuario abre esa ficha (`CompletarFicha`, que se dispara al cargarla). Así el recorrido
masivo tiene final, en vez de repetirse cada día sobre todo lo nuevo.

`subastas.lectura` guarda el nivel. **Hace falta guardarlo**: sin él, «la autoridad no
consta» y «aún no se ha mirado esa pestaña» serían indistinguibles — el mismo error de
siempre. Por eso también la escritura protege con `COALESCE` los campos de autoridad:
una lectura básica posterior nunca borra lo que ya se sabía.

**⚠️ Los lotes se leen TODOS aunque la lectura sea básica.** Leer solo el primero era lo
tentador, pero los importes de la subasta son la suma de los lotes: con uno de siete, el
listado enseñaría el precio de una parte como el del conjunto.

#### ⚠️ El BOE fecha en `YYYYMMDD`, sin guiones

`anuncios_boe.fecha_publicacion` es `'20260613'`, no `'2026-06-13'`. Comparar contra un
ISO normal **no da error, da lo contrario de lo que pides, y en silencio**:
`'20260613' >= '2026-08-01'` es CIERTO, porque en la quinta posición el `'0'` (48) es
mayor que el `'-'` (45). Con eso, las 2.816 subastas atrasadas se clasificaban como
«nuevas» y la precarga se quedaba sin nada que hacer. `hoy()` en `cola.ts` devuelve ya el
formato compacto.

#### Precarga del atraso (`npm run precargar`)

Recorre lo anunciado **antes de hoy**, de lo más reciente a lo más antiguo (una subasta
dura ~20 días desde su anuncio, así que lo reciente es lo que sigue activo).
Deliberadamente lento e interrumpible:

- Ritmo por defecto: una subasta cada 4 s, ajustable con `--espera`.
- `Ctrl+C` para en la subasta en curso y el progreso queda guardado.
- Lo ya leído no se vuelve a pedir; lo que falla 3 veces se abandona (`cola_portal`).
- Encadena Catastro con las referencias que encuentre y evalúa las alertas al terminar.

Esto **sí** es un recorrido sistemático de un sitio con `Disallow`, a diferencia de la
consulta bajo demanda. Fue una decisión explícita del usuario para poder filtrar y
mapear sobre el catálogo completo. Sigue siendo uso personal y no se redistribuye.

Los dos recorridos comparten motor (`recorrido.ts`) a propósito: son el mismo bucle con
distinto filtro y nivel, y separarlos en dos ficheros los dejaría divergir, que es justo
lo que pasó con el escaneo de adjuntos.

## Avisos fuera de la web: correo y notificación al móvil

Una alerta que encaja generaba una fila en `avisos` y ahí se quedaba: había que entrar a
mirar. Ahora sale por dos vías, las dos gratuitas y sin cuentas nuevas (migración 016).

| Vía | Cómo | Configuración |
|---|---|---|
| **Correo** | SMTP con `nodemailer` | `SMTP_*` en `.env` |
| **Push al móvil** | Web Push (VAPID) | **ninguna**: las claves se generan solas |

- **Un envío por tanda, no uno por aviso.** Una precarga genera decenas de coincidencias
  de golpe; se agrupan en un resumen y una sola notificación.
- **Marcar como enviado es lo que evita repetir**, y solo se marca **si alguna vía ha
  funcionado**. Si fallan todas, los avisos siguen pendientes: dar por enviado lo que no
  salió sería perderlo en silencio.
- **⚠️ `notificado_en` no es `visto`.** Son dos hechos distintos y se guardan aparte:
  marcar un aviso como visto en la web no debe cancelar su envío, ni enviarlo darlo por
  leído.
- **⚠️ Al encender las notificaciones se silencia lo atrasado.** Hay cientos de avisos
  acumulados; el primer envío habría sido una avalancha. `silenciarAtrasados()` los da por
  notificados y a partir de ahí llega solo lo nuevo.

### Web Push — lo que cuesta descubrir

Se eligió sobre las notificaciones de Expo porque **no necesita cuenta, ni tarjeta, ni
tienda de aplicaciones**, y funciona hoy con la web que ya existe. Las claves VAPID se
generan la primera vez que se abre `/ajustes` y se guardan en `ajustes`.

- **⚠️ Las claves VAPID no deben cambiar NUNCA.** Cada suscripción queda atada a la
  pública con la que se creó: regenerarlas deja mudos todos los dispositivos y hay que
  volver a dar permiso en cada uno.
- **⚠️ Sin HTTPS no hay nada.** Los service workers solo arrancan en contexto seguro.
  `localhost` está exento, pero **`http://192.168.1.x` no** — que es justo como se abre la
  web desde el móvil en la red de casa. Es el motivo de fondo para servir por Tailscale.
- **⚠️ En iOS hay que instalar la web** («Añadir a inicio»): Safari no da push a una
  pestaña. De ahí `app/manifest.ts` y los iconos, incluido uno `maskable` —sin él, Android
  mete el icono cuadrado en un círculo blanco.
- **Un 404 o un 410 del servicio de push son definitivos**: la suscripción está muerta y se
  borra en el acto. Reintentarla es tráfico perdido para siempre.
- El service worker **no cachea nada** a propósito. Los datos salen de un SQLite que está
  en el mismo ordenador que el servidor: sin red no hay web, y una caché solo conseguiría
  enseñar importes viejos de subastas vivas.

Comprobado de punta a punta contra FCM: `npm run notificar -- --probar` envió una
notificación real a un Chromium suscrito. Lo que **no** se puede probar en local es la
entrega a un móvil, que exige el HTTPS de abajo.

### Ver la web desde fuera de casa

El servidor es el ordenador del usuario y **todo se descarga ahí**. Un móvil que abre la
web no pide nada al Portal ni al IGN: le pide las páginas y las imágenes a ese ordenador,
que responde con lo que ya tiene o lo busca una vez y lo guarda. La consecuencia es que
**el ordenador tiene que estar encendido** y que ningún otro dispositivo acumula copias.

| Camino | HTTPS | Expone a Internet | Veredicto |
|---|---|---|---|
| **Tailscale** (`tailscale serve`) | sí, certificado válido | **no** | lo que encaja |
| Cloudflare Tunnel | sí | **sí** | exige autenticación delante |
| Abrir puerto del router | no | sí | no |

Tailscale es el único que resuelve las dos cosas a la vez: llegar desde cualquier sitio y
dar el HTTPS que las notificaciones necesitan, sin abrir un puerto ni publicar nada. Con
Cloudflare Tunnel hay que poner autenticación **antes** de encenderlo: `/cuenta` guarda la
contraseña del Portal. Está explicado en la propia web, en `/ajustes`.

`WEB_URL` (o el campo de `/ajustes`) es la dirección que se pone en los enlaces de los
avisos: con `localhost` un enlace abierto en el móvil no lleva a ninguna parte.

## Estructura

```
apps/
  web/                 Next.js 16 — buscador, ficha, histórico
  mobile/              Expo 57 — consulta y alertas
packages/
  core/                Tipos, esquemas Zod, dinero (compartido web+móvil+ingesta)
  db/                  SQLite: migraciones .sql numeradas y acceso
  ingest/              Workers de ingesta y enriquecimiento
    sources/boe-api/         API datos abiertos (fuente primaria)
    sources/catastro/        Servicios OVC
    sources/portal-subastas/ Scraping acotado (ver aviso arriba)
docs/
apps/web/public/sw.js  Service worker: SOLO push, no cachea nada
data/subastas.db       BD local (fuera de git). Lleva las cuentas del Portal
data/calle/            Fotos de calle de Mapillary, una por referencia catastral
data/fotos/            Fotografías del inmueble publicadas por el Portal
data/satelite/         Ortofotos del IGN, cacheadas al verlas
```

## Convenciones

- Todo dato externo entra por un **esquema Zod** de `packages/core/src/schemas/`. Nada sin
  validar llega a la BD.
- Los identificadores del BOE (`SUB-JA-2026-XXXXXX`) son la clave primaria.
- La referencia catastral es la clave de unión con Catastro. Muchos anuncios no la traen:
  el enriquecimiento es *best-effort* y su ausencia nunca rompe la ficha.
- Importes en **céntimos, enteros** (`core/money.ts`). Nunca float para dinero.
- Fechas en ISO 8601 con zona `Europe/Madrid`.
- Migraciones: ficheros `.sql` numerados en `packages/db/migrations/`. Nunca se editan una
  vez aplicadas; se añade una nueva.
- **Los imports relativos dentro de los paquetes van SIN extensión** (`'./index'`, no
  `'./index.js'`). Turbopack no resuelve `.js` → `.ts` y la web falla al compilar.
- ⚠️ **No edites ficheros con PowerShell 5.1.** `Get-Content -Raw` lee en ANSI y
  `Set-Content -Encoding utf8` reescribe: el resultado es doble codificación
  (`librería` → `librerÃ­a`, `€` → `â‚¬`). Usa las herramientas de edición.

## Web (`apps/web`)

Next.js 16 con App Router. **Ojo: `params` y `searchParams` son `Promise`**, hay que
`await`. La doc versionada está en `node_modules/next/dist/docs/` — es la fuente de
verdad, no la memoria.

- `next.config.ts` necesita `transpilePackages` con los tres paquetes del workspace,
  porque exportan TypeScript sin compilar.
- Las páginas leen SQLite directamente desde Server Components
  (`packages/db/src/consultas.ts`). No hay capa de API: para la app móvil habrá que
  añadir route handlers sobre esas mismas funciones.
- `export const dynamic = 'force-dynamic'`: los datos cambian con cada ingesta.
- **⚠️ `node:sqlite` devuelve filas con prototipo nulo**, y React las rechaza al pasarlas
  a un Client Component ("Only plain objects can be passed…"). Todo lo que cruce esa
  frontera —como `puntosMapa()` para el mapa— debe reconstruirse como objeto literal.
- **⚠️ El nº de lote NO identifica un bien.** Un lote puede traer muchos inmuebles (hay
  uno con 24), así que `key={lote.numero}` colisiona y React avisa de claves repetidas.
  La clave única es el `id` del inmueble. Este mismo hecho ya había roto el listado
  multiplicando filas en el JOIN: si aparece un duplicado, sospecha de esto primero.
- **⚠️ Varios bienes pueden compartir referencia catastral** y entonces el bloque de
  ubicación —mapa, vista de calle, ortofotos— se pintaba una vez por bien. En
  `SUB-JA-2023-223960` los inmuebles 400 y 401, en lotes distintos, son el mismo
  `1235903XM5313E0001UY`: la ficha enseñaba las imágenes por duplicado. La ficha marca
  con `mostrarUbicacion` el primer bien de cada punto (clave: refcat, o lat/lon si no
  la hay).
- **⚠️ Una sola versión de React en todo el monorepo.** Expo 57 fija `react@19.2.3` y
  Next 16 usa `19.2.4`; npm dejaba la primera en la raíz y la segunda en `apps/web`.
  Dos copias de React en el mismo árbol de Server Components revientan en el navegador
  con `chunk.reason.enqueueModel is not a function`, que no dice nada de la causa real.
  Lo fija el bloque `overrides` del `package.json` raíz: **no lo quites**, y si algún día
  hay un error raro de RSC, comprueba antes que nada `npm ls react`.

Rutas: `/` catálogo con filtros · `/mapa` Leaflet + OpenStreetMap · `/pujas` · `/alertas` ·
`/cuenta` cuentas del Portal y login 2FA · `/ajustes` notificaciones y acceso remoto.

**⚠️ El filtro por población hay que normalizarlo.** El Portal escribe la misma
localidad de varias formas —`MALAGA`, `MÁLAGA` y `Málaga` son tres filas distintas en
`inmuebles`— así que una comparación literal devuelve un trozo de lo que hay: eran 901
"localidades" para 787 reales. `abrirBd()` registra una función SQL `sin_tildes()`
(`db.function()` de `node:sqlite`, con `NFD` + quitar combinantes); en SQL puro no se
puede, porque `UPPER()` de SQLite es ASCII y deja la tilde intacta. El desplegable
agrupa por la forma normalizada, enseña la variante más frecuente y cuenta el **total**
de la población, no el de esa grafía. Se acota solo a la provincia ya elegida, y es un
`<datalist>` para no montar un `<select>` de 787 opciones sin necesitar JavaScript.

`/pujas` lista la última captura de cada subasta con la pestaña leída, ordenable por
puja, por remate (puja/salida) o por salida, y filtrable por situación. Es una tabla a
propósito: los importes se comparan en columna, con `tabular` y el scroll horizontal
dentro de su contenedor, nunca en la página.

El botón **«Consultar ficha en el Portal»** de una subasta sin leer es una Server Action
(`app/acciones.ts`) con `useActionState`: tarda 10-15 s porque son cuatro pestañas más
Catastro, así que el estado de espera es explícito.

**El catálogo y la ficha son dos cosas distintas**, y así se refleja en la interfaz: el
listado sale de `anuncio_subastas` (todo lo que el BOE conoce) y marca "Ficha sin leer"
lo que aún no se ha consultado al Portal. Abrir una de esas muestra el edicto del BOE y
el comando para leerla. Eso *es* el diseño bajo demanda.

### Sistema de color

Todo el color sale de tokens semánticos en `globals.css`, nunca de colores sueltos de
Tailwind. Hay tema claro y oscuro; un componente no necesita saber en cuál está.

**Oscuro por defecto, y el tema lo decide el servidor.** No se usa
`prefers-color-scheme`: lo manda la cookie `tema`, que el layout lee con `cookies()` y
estampa como `data-tema` en `<html>`. El HTML sale del servidor **ya con el tema puesto**,
así que no hay parpadeo — ni el destello blanco del truco clásico de leer `localStorage`
en un script bloqueante, ni una segunda pintada. El interruptor de la cabecera solo mueve
el atributo (cambio inmediato, sin recargar) y escribe la cookie; no hay Server Action,
porque cambiar de tema no toca ningún dato y un viaje al servidor solo añadiría un salto.

Que el valor por defecto viva en `:root` y el claro en `:root[data-tema="claro"]` es
deliberado: sin cookie, sin JavaScript o si algo falla, sale oscuro.

| Token | Significado |
|---|---|
| `fondo` / `superficie` / `superficie-alta` | Profundidad, de atrás hacia delante |
| `texto` / `suave` / `tenue` | Jerarquía de lectura |
| `oportunidad` | Descuento sobre tasación |
| `riesgo` | Cargas, "no consta", vivienda habitual |
| `dato` | Enriquecimiento externo (Catastro) |

**⚠️ Las reglas CSS fuera de `@layer` ganan a TODAS las utilidades de Tailwind.** La
plantilla traía un `body { background: … }` suelto que anulaba las clases del layout: en
tema claro quedaba texto casi blanco sobre fondo blanco. Los estilos base van dentro de
`@layer base`.

Contraste verificado con Playwright sobre los colores ya computados por el navegador, en
ambos temas y en las dos páginas: **0 elementos por debajo de WCAG AA (4.5:1)**. El tono
`tenue` se usa a 11px, así que va más oscuro de lo que pediría el gusto.

### Qué se necesita para pujar, en el listado

Cada fila del catálogo lleva tres cifras además del valor de salida, porque **la salida
no dice lo que hay que poner sobre la mesa**:

- **Desde**: la puja mínima si la hay; si ya hay pujas, la última, que es desde donde
  habrá que subir. Con «Sin puja mínima» se escribe eso, no un hueco. Con pujas pero sin
  importe (sin sesión), «Hay pujas · importe reservado» — nunca un guion, que se leería
  como que no las hay.
- **Depósito**: sin constituirlo no se puede pujar, así que es el desembolso mínimo real.
- **Tramo**: el escalón entre pujas.

Los importes de esa línea van con `eurCorto`, que **siempre agrupa los miles**: el
español no agrupa los números de cuatro cifras y «9318 €» junto a «41.920 €» se lee mal.
Misma razón que `eurExacto` en la ficha.

### Criterios de la interfaz

- **El color comunica, no decora.** La barra de descuento solo va en verde si hay
  descuento real; al 100% de tasación se pinta neutra, porque una barra verde llena se
  lee como buena señal siendo lo contrario.
- Importes y superficies con `font-variant-numeric: tabular-nums` (clase `.tabular`):
  se comparan en columna.
- Porcentajes por `Intl` (`porcentaje()`), nunca `toFixed()`: en español el separador
  decimal es la coma.
- El aviso de «no consta» aparece siempre que falten cargas o situación posesoria. Es
  el matiz que más caro sale en una subasta y no debe quedar como un hueco vacío.

## MCP configurados (`.mcp.json`)

- **context7** — documentación al día. **Next.js 16 y Expo 57 son posteriores a mi
  conocimiento** y ambas plantillas avisan de cambios rompedores: consúltalo antes de
  escribir código de esas librerías en vez de tirar de memoria.
- **playwright** — depurar la web propia y, si se activa, el Portal de Subastas.

Descartados: **firecrawl** (las fuentes no son HTML) y **firebase** (sin servicios cloud).
Pendiente: **graphify** (grafo del código); hay tres proyectos homónimos y falta decidir
cuál, y no aporta hasta que haya bastante código.

## Comandos

```bash
npm install          # instala todo el workspace
npm run migrate      # aplica migraciones pendientes a data/subastas.db
npm run dev          # web + móvil en paralelo (turbo)
npm run dev:web      # solo Next.js
npm run dev:mobile   # solo Expo
npm run typecheck    # tsc --noEmit en los 5 paquetes

# Datos
npm run ingest -- --dias 30                          # catálogo desde el BOE
npm run ingest -- --desde 2026-01-01 --hasta 2026-07-29
npm run enriquecer -- --limite 50                    # Catastro sobre lo pendiente
npm run ficha -- SUB-AT-2026-26R4586001001           # ficha del Portal + Catastro
npm run calles                                       # fotos de calle (Mapillary)
npm run calles -- --limite 100 --espera 1500
npm run readjuntos                                   # adjuntos desde la caché, sin red
npm run repujas                                      # situación de la puja, desde la caché
npm run reminimas                                    # «sin puja mínima» vs «no consta», desde la caché
npm run entrar                                       # abre sesión (pide código 2FA)
npm run entrar -- --cuenta 2                         # con varias cuentas guardadas
npm run probar-sesion                                # ¿sigue viva? si no, la descarta
npm run notificar                                    # envía los avisos pendientes
npm run notificar -- --probar                        # prueba correo y push, sin avisos
npm run notificar -- --silenciar                     # da por enviado lo atrasado
npm run probar-sesion -- SUB-JA-2026-264608
npm run pujas                                        # refresca la puja de lo que está en curso
npm run pujas -- --limite 50 --espera 4000
npm run fotos                                        # fotos del inmueble (Portal)
npm run precargar                                    # atraso: ficha completa (lento)
npm run precargar -- --limite 200 --espera 5000
npm run basicas                                      # lo nuevo: datos y bienes (2 pestañas)
npm run basicas -- --limite 100
npm run ficha -- SUB-JA-2026-264608 --basica         # una suelta, en básico
npm run alertas                                      # evalúa las alertas guardadas

# Diagnóstico (desde packages/ingest)
npx tsx src/sources/boe-api/explorar.ts 20260728      # qué hay en el sumario de un día
npx tsx src/sources/catastro/consultar.ts <refcat>    # consulta suelta al OVC
npx tsx src/sources/portal-subastas/probar-parser.ts <dir> <SUB-ID>  # parser sin red
```
