# Delegá o Morí — CLAUDE.md

Single-file incremental game. `index.html` (~1.9k lines), no build, no deps, no bundler. Push to `main` → Vercel deploys in ~30s.

## Lo que es

Un juego estilo Universal Paperclips. Manejás una agencia de marketing desde el 28 nov 2022 (2 días antes del lanzamiento de ChatGPT) hasta jun 2026. Cada tick = 1 semana. La métrica de victoria es bajar tus horas trabajadas, no facturar más. Perdés por burnout (≥80h) o quiebra ($0).

**Esto es una pieza de marketing viral de Axel (FIA).** No es un producto de software. El criterio de éxito es que sea jugable y viral, no que sea código limpio.

## Mapa del archivo

```
index.html
├── <style>      Variables CSS, layout. Mono + acento naranja #E8590C.
├── <body>       HTML estático: header, panels, overlay+modal.
└── <script>
    ├── Constantes: TIMELINE[] (188 eventos), PROJECTS[], EMP, LV, PROV_STATS
    ├── freshState()       Estado inicial completo. Todo lo que no esté acá no persiste.
    ├── $, U, P, N         Shortcuts: getElementById, unlocked, project, news
    ├── calcHours()        LA métrica central. Suma 6 términos: fundador+gestión+coordinación+clientes+supervisión+docsWip
    ├── hourHint()         Detecta el término dominante y muestra la palanca
    ├── tick()             ~300 líneas. Corre cada 6s. Revenue, tokens, workers, migración, eventos, cobranzas, moral, wins/losses.
    ├── checkUnlocks()     Toda la lógica de reveal progresivo
    ├── render()           Repinta todo. Llamar después de cambiar estado.
    ├── paintLive()        rAF loop. Interpolación visual de cash/tokens/hours.
    ├── showEvent()        Abre modal. Setea evtOpen=true.
    ├── evtAct(i)          Cierra modal (evtOpen=false PRIMERO), luego corre la acción, luego pump().
    ├── startGame(save)    Arranca/carga partida. Siempre Object.assign({},freshState(),save).
    ├── Save slots         openSaveManager, saveSlot, loadSlot, exportSave, importSave
    └── IIFE (intro)       Corre al cargar. Muestra el modal inicial.
```

## Invariantes que nunca hay que romper

**1. `totalEmps()` ya incluye `S.rh`.** No lo sumes de nuevo en ningún lado.

**2. `calcHours()` es la condición de derrota.** Si agregás una fuente de horas, agregala acá también. Si cambiás la coordinación, verificá que el arco valle sea 44-58h con 20-40 empleados.

**3. `evtOpen` bloquea los ticks.** Mientras hay un modal abierto, el tiempo no corre. Si algo quedó con `evtOpen=true` y el overlay oculto, el juego se cuelga.

**4. `evtAct` limpia `evtOpen` ANTES de llamar la acción.** Así las acciones que abren otro modal (como `openSaveManager()`) no quedan bloqueadas por el guard `if(evtOpen)return`.

**5. `startGame(fromSave)` siempre hace `Object.assign({},freshState(),fromSave)`.** Nunca asignes el save directamente a `S` — los campos nuevos que no estén en el save quedarían undefined.

**6. Las suscripciones tienen permanencia mínima de 4 semanas.** `S.subSince[id]` registra cuándo se activó. El toggle no puede apagarse antes de `S.subSince[id]+4`.

**7. Los niveles WORKIA:** N1/N2 multiplican humanos (sin equipo = output 0). N4 es la primera IA autónoma. N5 multiplica N4s. N4a (n8n) queda legacy en s118.

## Qué tocar para qué

| Quiero... | Editar... |
|---|---|
| Nuevo evento de noticias | `TIMELINE[]` + `newsTick()` en tick() |
| Nuevo proyecto comprable | `PROJECTS[]` (declarativo) |
| Nueva suscripción | `S.subs`, `subWeeklyCost()`, `toggleSub()`, render de panel |
| Nuevo rol (empleado) | `EMP{}`, `hire()`, `fireEmp()`, `calcHours()` |
| Nuevo modificador de horas | `calcHours()` + `hourHint()` |
| Nueva condición de victoria | `tick()` bloque de wins, `checkUnlocks()` |
| Nuevo proveedor | `PROV_STATS[]`, `queueProvElection()`, `selectProvider()` |

## Dev workflow

```bash
# Test manual
# Abrir index.html en Chrome, F12, revisar console

# Tests automáticos (save slots)
npx playwright test          # 14 tests, ~7s

# Deploy
git add index.html && git commit -m "feat: ..." && git push
# Vercel detecta el push y despliega en ~30s
```

Corré los tests Playwright si tocaste: `startGame`, `evtAct`, `showEvent`, `openSaveManager`, `loadSlot`, `importSave`, `exportSave`, o el IIFE del intro.

## Estilo del código

El código es deliberadamente terse. Variables cortas en paths calientes (`S`, `U`, `P`, `$`, `w`, `a`). Sin clases, sin módulos. Mantené esa densidad — no refactorices por refactorizar.

- Sin comentarios que expliquen QUÉ hace el código. Solo el POR QUÉ cuando no es obvio.
- Sin manejo de errores para casos imposibles.
- Sin abstracciones prematuras. Tres líneas similares son mejores que una función nueva.
- Mobile-first. Probá en 390px de ancho.

## Números clave del balance

| Métrica | Valor |
|---|---|
| Ticks totales | 188 (28 nov 2022 → 30 jun 2026) |
| Velocidad | 6s/tick × 1, 3s/tick × 2 |
| Valle esperado | 44-58h entre sem 30-80 con 20-40 empleados |
| Retiro esperado | ~sem 172-185 |
| burnCap por defecto | 80h (65h si llega el hijo) |
| Coordinación | 0.025 × T² (T = total empleados) |
| Manager scope | 1 manager cada 8 personas |

Si cambiás algo de balance, simulá el arco completo mentalmente contra esos números antes de commitear.

## Qué NO hacer

- No agregues dependencias. Todo vive en un archivo HTML.
- No crees un build system.
- No separes en módulos.
- No uses TypeScript.
- No "limpies" el código sin pedido explícito — la terseness es intencional.
- No toques `timeline.html` a menos que haya un cambio real de historia del juego.
