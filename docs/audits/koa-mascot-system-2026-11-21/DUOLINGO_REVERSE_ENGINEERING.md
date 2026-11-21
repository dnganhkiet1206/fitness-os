# DUOLINGO REVERSE ENGINEERING — Duo Character Consistency System

**Phase I — ASCND Mascot Mission | Draft**
**Access date for all findings: 2026-11-21** (unless a source's own publication date is given)
**Status:** Research draft, not a specification. Every finding carries an evidence tier.
**Compliance:** Public sources and publicly served assets only. No internal Duolingo documents, no leaked material, no employee-only systems were sought or used. No Duolingo artwork, logo, or character art is reproduced here — only URLs, measurements, and principle-level analysis. The Duolingo web app's login-gated lesson runtime was **not** probed.

---

## 0. How to read this document

### Evidence tiers

| Tier | Meaning |
|---|---|
| **VERIFIED** | Direct statement from Duolingo or a named Duolingo designer/animator, in a Duolingo-owned publication or a direct interview; or a measurement I made myself from a publicly served Duolingo asset. |
| **STRONGLY SUPPORTED** | Multiple independent reliable signs, including vendor case studies quoting named Duolingo employees, or secondary distillations that claim direct capture from Duolingo's formerly public guidelines. |
| **INFERRED** | From observed public output only; no direct statement found. |
| **UNKNOWN** | Insufficient public data. Absence of evidence is **not** evidence of absence. |

### Method log (what was actually done)

1. **Web research** (3 parallel tracks + coordinator spot-checks): Duolingo Blog (design + engineering), Apple Developer interview, Advertising Week interview, LottieFiles case study, Rive case studies, Duocon talk listings, job boards, GitHub org API, Google Patents / WIPO.
2. **Direct verification by the coordinator:** re-opened and read `blog.duolingo.com/world-character-visemes/` and `blog.duolingo.com/how-to-draw-duo-the-owl/` in full on 2026-11-21; opened the LottieFiles Duolingo case study page; fetched the WIPO record WO/2018/089133.
3. **Public-asset forensics** (all files served publicly by Duolingo's own CDN/blog, downloaded with plain HTTPS GET, analysed locally in `/tmp/duo-analysis`, never republished):
   - Official Duo SVG served by `d35aaqx5ub95lt.cloudfront.net` (sitting Duo reading a book): parsed XML structure, path/fill inventory, per-fill bounding boxes.
   - Official blog PNGs (`blog.duolingo.com` / Ghost CDN): pixel-level colour census with PIL, bounding boxes of the Duo-green region.
   - Public web shell (`duolingo.com/`, `/learn`): downloaded the JS bundles the public shell references and grepped them for `rive`, `lottie`, `.riv`, and asset paths.
4. **Image collection:** `image-search` CLI (10 queries × 5 results) + web search; 40 references across 10 pose categories (Section 1).
5. **Patent search:** Google Patents / WIPO queries for Duolingo-assignee animation/character/lip-sync patents (Section 6).
6. **Open-source audit:** public GitHub API `api.github.com/orgs/duolingo/repos` (Section 6).

### What this document is NOT

- It is not a claim that any single pipeline produces *every* Duo pose. The evidence supports a **multi-track** model (Section 4), and the tracks have different evidence strengths.
- It does not contain Duolingo source files, rig files, model sheets, or internal guidelines. None were found publicly, and none were sought through non-public channels.

---

## 1. Image reference collection — Duo across poses

Collected 2026-11-21 via the image-search CLI + web search. No artwork downloaded for reuse; URLs are reference links only. "Official" = the file is hosted on Duolingo's own CDN/blog (`blog.duolingo.com`, `storage.ghost.io` Duolingo account, `d35aaqx5ub95lt.cloudfront.net`) or on `duolingo.com` itself. Several official files surface on third-party pages — the **media host** is the reliable official signal, not the linking page.

Canonical anatomy references (official, first-party):
- "How to draw Duo in 10 easy steps" — https://blog.duolingo.com/how-to-draw-duo-the-owl/ (2022-06-10, updated 2025-01-06)
- "Reshaping Duo" (design history) — https://blog.duolingo.com/reshaping-duo/ (2013-11-20)
- Note: the former reference page `design.duolingo.com/illustration/duo` (once cited as the source of the Wikipedia Duo SVG) **no longer exists as such** — as of 2026-11-21 `design.duolingo.com` renders as an "Articles about Design" blog. Former guideline paths (`/identity/color`, `/illustration/shape-language`, etc.) are visible only via web.archive.org snapshots.

### 1.1 Standing (neutral / default)

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://cloud.educaplay.com/recursos/155/4971964/imagen_1_1573939793.jpg | Third-party (educaplay.com) | Front-facing Duo on white; lighter-green chest, big white eyes, small orange beak, orange feet, wavy head tuft. |
| 2 | https://assets.isu.pub/document-structure/240409113652-d053ab9a22c4e3ccff96ca2a38a58891/v1/676c5650bb1a0449c36caee52ac7b0dd.jpeg | Third-party (isu.pub) | Duo on black, body tilted, one ear tuft raised, open beak, thin white ground line. |
| 3 | https://github.com/duolingo.png | Third-party (via lobehub.com) | Duolingo's official GitHub avatar: clean front-facing Duo icon, rounded body, pointed ear tufts, three chest feather lines. |
| 4 | https://getdrawings.com/free-icon/duolingo-icon-62.png | Third-party (getdrawings.com) | Duo upright in a white hexagon, subtle 3D shading, wings at sides, small black three-toed feet. |

### 1.2 Running

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://blog.duolingo.com/content/images/2021/05/Eddy-Duo---Run--1-.png | **Official file** (Duolingo blog CDN) | Duo jogging beside a human runner, both in red headbands, open beak, wide eyes, one wing raised to face, blue sweat droplets. |
| 2 | https://cdn.talkie-ai.com/talkie-user-img/217826473271497/304765135814936.jpg | Third-party (talkie-ai.com) | Duo mid-strut on dark background, startled/excited, open beak with pink tongue, one wing near face, other outstretched, yellow motion lines. |
| 3 | https://p16-ulike.capcutcdn-us.com/img/tos-alisg-v-2823c799-sg/okz03AqkaHnOy4JqAosJiBCIAABiPZMR2KgHE~tplv-obj.image | Third-party (CapCut template) | Meme-style Duo running/strutting left, smug, one narrowed eye, starburst sparkle, detached feather behind. |
| 4 | https://cdn.advertisingvietnam.com/image/2021/06/23/1624430103365.png | Press (advertisingvietnam.com) | Duo running forward chasing a startled office worker, red backpack — push-notification chase metaphor. |

### 1.3 Celebrating

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/2024/05/cover_yir.png | **Official** (blog.duolingo.com/year-in-review-behind-the-scenes/) | Duo in a party hat holding a lit sparkler in each raised wing, open beak, pink tongue, dark-blue night background with stars. |
| 2 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/2021/12/New-Years-Duo-Blog-5-2.png | **Official** (blog.duolingo.com) | Duo centre-frame among balloon-like characters, open beak, confetti everywhere, New Year's scene. |
| 3 | https://www.happymaplelanguageco.com/wp-content/uploads/2021/06/Duolingo.jpg | Third-party (language blog) | Duo hovering mid-air, one wing raised, beside a "7" streak calendar, streak-freeze crystal, purple gem. |
| 4 | https://cdn.appleosophy.com/2022/08/V2Blog-Hero-2-696x421.png | Press (appleosophy.com) | Duo floating above a large gold coin with checkmark, surrounded by reward badges on purple. |

### 1.4 Sad / crying

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://www.intego.com/mac-security-blog/wp-content/uploads/2023/08/Duo-crying-Duolingo-data-breach-600x300-1.jpg | Press (intego.com) | Duo crying on dark background: large blue teardrops from lower eyelids, small orange beak, orange feet. |
| 2 | https://i.pinimg.com/originals/94/94/8d/94948d2c5fc655c3e43aab8c550fea6a.jpg | Third-party (Pinterest repost) | Full-body sad Duo on white: tear-filled eyes, downturned frown marks, blue teardrops pooling at eyes. |
| 3 | https://images.squarespace-cdn.com/content/v1/59b8fbb4d7bdce10432811e1/1568371130511-ZAKH82C8R8LAFHMFI0SG/Duolingo_05_TubeHidingTears_5s_AndRising_MWU_20190910_v006+1x1+(0-00-00-00).png | Third-party (mavink.com) | Close-up face only: huge oval eyes, blue tears streaming, tiny dark-green chevron frown under beak. |

### 1.5 Sitting

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://d35aaqx5ub95lt.cloudfront.net/images/pathCharacters/active/2b8208acfd8a19539a7f1f0f583eedaa.svg | **Official** (duolingo.com course asset) | Duo sitting atop a stack of three books reading an open blue book held with both wings; soft gray shadow under the stack. **This is the SVG analysed in Section 3.** |
| 2 | http://img.neuronmagazine.com/2024/01/duolingo-careers.png | Press (neuronmagazine.com) | Duo sitting at a desk with a laptop (rendered blue-gray in this variant, with glasses), coffee cups, plant, books. Off-model recolour — not standard green. |
| 3 | https://wkams.com/wp-content/uploads/2021/02/WKAMS-_-Overview-Image-828x708.jpg | Third-party (wkams.com) | Duo sitting on a red stool at a brown piano, wings extended outward, beak open as if singing. |
| 4 | https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:gorq7i3msirfgxrxc6kklnl7/bafkreih3hio3zxe7fweoo7kifjg7d4bwehxodq47h2ukz5s3es3phnscsi | Third-party (Bluesky repost) | Duo sitting in a dark gray armchair behind a silver laptop, side table with lamp and plant. |

### 1.6 Exercising / workout

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://blog.duolingo.com/content/images/2021/05/Eddy-Duo---Run--1-.png | **Official file** (same as §1.2 #1) | Duo + human jogging in place, red headbands, sweat droplets, exertion faces. |
| 2 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/size/w1200/2026/04/cover_how-to-review-previous-lessons--2-.png | **Official** (blog.duolingo.com) | Duo straining while lifting a barbell on solid blue: red-white striped headband, arms flexed up, wide eyes, strained mouth, blue sweat droplets, barbell with black plates and orange collars. |
| 3 | https://stickerly.pstatic.net/sticker_pack/SjPcCL28t8VxnbnWdwZSEQ/L3RYJB/2/46fd713d-d1d9-45f7-b46d-af42ccb099e0.png | Third-party (sticker.ly) | Chest-up Duo flexing a gray dumbbell overhead, red-white striped headband, bicep shape drawn into the green body, small smile. |
| 4 | https://prezigram-assets.prezicdn.net/e08d41b5450ada89eaeef1dcfa8c757bca5baafeabbf0741341a713ac8c4beb5f2a19d4da910246106bd4922c0c101cedcadfdf72ba2b03b561acdccdd3b3c0d | Third-party (prezi.com) | Duo overhead-pressing a gray barbell with large dark plates, both arms raised, red-white striped headband, open beak. |

### 1.7 Waving / pointing

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/size/w1200/2026/03/Cover_Goodbye-in-English.png | **Official** (blog.duolingo.com) | Duo waving with one raised wing while holding a blank white speech bubble, cheerful open-mouth expression, solid purple background. |
| 2 | https://cdn.prod.website-files.com/67b46138275d129f83d0074b/68e8adeadf68fb8537f6288a_67e40792523bd14941a9268a_duo-hi.png | Third-party (Webflow asset) | Close-up Duo leaning forward, one wing raised in a wave, one eye slightly narrowed/winking, orange feet on a thin gray bar. |
| 3 | https://file.digitaling.com/eImg/uimages/20241015/remote_172895990229115.gif | Third-party (GIF) | Animated Duo on black: one wing raised waving, open beak, eyes looking up and to the side, three lighter-green chest feather marks. |
| 4 | https://assets.rendageek.com.br/wp-content/uploads/2026/01/duolingo.png | Third-party (rendageek.com.br) | Duo on vivid yellow with sunburst rays, one wing raised outward waving, beak slightly open, diamond sparkles around. |

### 1.8 Flying / jumping

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/2022/12/header-image-1.png | **Official** (blog.duolingo.com/tips-for-maintaining-streak/) | Duo mid-air leaping over a gray calendar page, wings spread, smiling, surrounded by floating app icons (gems, flame, flags, hearts, stars). |
| 2 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/2026/04/cover_FreePracticeHub-1.png | **Official** (blog.duolingo.com) | Duo mid-jump on solid blue holding a light-blue dumbbell in one raised wing, other wing extended, open beak with pink tongue, sparkle stars. |
| 3 | https://assets.emailinspire.com/image-assets/e8b7ef2b-b2e1-42f4-8886-70e2672c1d0c.jpg?w=1600&h=900&fit=crop | Third-party (emailinspire.com, Duolingo email) | Duo leaping off a small grassy cliff into a light-blue sky, one wing raised, mouth open excited, two orange ovals floating near him. |
| 4 | https://techhaps.com/files/e8b7ef2b-b2e1-42f4-8886-70e2672c1d0c.jpg?w=1600&h=900&fit=crop | Third-party (techhaps.com) | Duo mid-air in front of a rainbow, wings spread as if jumping/dancing, open beak with pink tongue, gray clouds and sparkle stars. |

### 1.9 Holding phone / object

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://storage.ghost.io/c/7a/33/7a33d0f4-927d-4fe8-a6bf-96131b5e76d4/content/images/2026/04/cover_Practice-hack-Change-your-phone---s-language-and-level-up-your-learning.png | **Official** (blog.duolingo.com/how-to-change-your-phone-language/) | Duo holding a smartphone up toward the viewer in one wing, other wing raised in a presenting wave, phone screen shows stylised app UI, lime-green background. |
| 2 | https://id-static.z-dn.net/files/da0/508a3d2f1c7870d88255f4bbc6e82e65.jpg | Third-party (brainly.co.id) | 3D-rendered Duo holding a black smartphone forward in its right wing, head tilted, beak open with pink tongue. |
| 3 | https://www.sharesub.com/cms/wp-content/uploads/2025/07/ChatGPT-Image-4-juil.-2025-16_50_36-768x768.png | Third-party (sharesub.com) | **AI-generated, not official art.** Duo at a wooden desk holding a dark phone, "DUOLINGO" book beside it. Flagged, do not use as reference. |
| 4 | https://africaneyereport.com/wp-content/uploads/2023/03/AI.jpeg | Press (africaneyereport.com) | Real photo, not illustration: a person's hands hold a phone showing Duolingo's green splash screen. Usage reference only. |

### 1.10 Angry / surprised

| # | Media URL | Source | Description |
|---|---|---|---|
| 1 | https://i.imgflip.com/9yb80r.jpg?a498165 | Third-party (imgflip.com meme) | "Duo screaming" meme template: mouth wide open showing white teeth and pink tongue, eyes squeezed shut, anger marks near head, dark-gray background. |
| 2 | https://advertisingweek.com/wp-content/uploads/2022/03/169duolingo_hero-740x560.jpg | Press (Advertising Week) | Grid of 8 Duo emotions on off-white: cheerful, shy/flustered, annoyed/stern (narrowed eyes), winking with tongue out, heart-eyes, musical/happy, **angry with furrowed brows and steam**, surprised/sad with teary eyes. Best single reference for the full expression range. |
| 3 | https://i.pinimg.com/originals/2b/22/a8/2b22a8d3f77ba1751ef47320634b6bdd.jpg | Third-party (Pinterest meme) | Split-screen: surprised Duo on blue (wide eyes, striped scarf, motion lines); angry Duo on red (darker olive-green, red cape, furrowed brows, "@#!" symbols). |
| 4 | https://fastly.mwm-storage.mwmcdn.com/raw_files/a2d8633a-32ed-4c7e-b802-5582dfc5ed31?width=400&quality=75&format=auto | Third-party (meme) | Duo with furrowed angry eyebrows and open displeased mouth under hand-drawn Spanish text "Haz tu leccion", cyan background. |

### 1.11 Cross-category observations (INFERRED from the collection)

- **Never changes:** bright lime-green rounded body; huge white oval eyes with black pupils (usually a white twinkle dot); small orange triangular beak; small orange pill-shaped feet, frequently floating/detached below the body; wavy ear tufts; three half-circle belly-feather marks.
- **What changes instead:** wing positions (the only "arms"), eye/brow/mouth state, body tilt/angle, and accessories (headband, party hat, scarf, cape) or props (phone, dumbbell, barbell, book, sparklers, confetti).
- **Expression system:** emotion = eyes + beak + optional eyebrows/steam/tears/sweat. There is no separate face rig — the face IS the expression system.
- **Official vs. meme split:** official blog art keeps Duo friendly and on-model; the angry/screaming and smug-running variants are overwhelmingly meme/third-party art, not Duolingo-published. The one official-adjacent exception is the Advertising Week 8-emotion grid, which Duolingo's own team supplied for the interview.
- **Caveats:** two results' `page_url`s point to third-party mirrors while the `media_url` itself is Duolingo's official blog CDN (running/workout) — the media host is the reliable official signal. One "holding phone" result is AI-generated and one is a real photo — flagged above. A few results returned no `page_url`.

---

## 2. Character construction — reverse engineering

### 2.1 Silhouette

- **There is no separate head and body. Duo is one unit — a circle / "chicken nugget" / cylinder.** Step 1 of the official drawing guide: "Draw a circle." Everything else is added *onto* that circle. Head-to-body ratio is therefore effectively **1:1 — the head IS the body**. (INFERRED, but directly entailed by the VERIFIED quotes below.)
- **VERIFIED** — Greg Hartman, Head of Art: *"Duo is constructed very simply, he's basically a chicken nugget with a face. The few shapes that make up Duo's body make him easy to pose and his big eyes make his expressions clear."* (Advertising Week, 2022-03-08.)
- **VERIFIED** — Tyler Murphy, head of design: *"We're using very simple geometry. His wings are just half circles hiding behind the body… He's more or less a cylinder with wings, and that made the animation and illustration time go down drastically."* (Apple Developer, 2020-10-26.)
- The silhouette is a **rounded blob, wider at the bottom, with a wavy top** — official guide Step 2: "Add a wavy shape on top… These are Duo's 'ears!'" The ear tufts are a wavy continuation of the top contour, not separate triangles (VERIFIED via official guide).
- **Belly detail does not break the silhouette:** three small half-circles low on the belly (guide Step 10: "Three half circles, to be exact") sit *inside* the outline (VERIFIED via official guide).
- The outer shape is the primary identifier. Hartman's rule, as relayed in secondary coverage: "if the outer shape fails, no interior detail can rescue it" (DesignRush — STRONGLY SUPPORTED, second-hand quote).

### 2.2 Anatomy / joints

- **Wings — half-circles hiding behind the body** (VERIFIED, Murphy quote). Official guide Step 3: "Think shark fin-shaped, but a little softer. They should both start where the wavy shape meets the circle on either side." Wings are **not arms**: no elbows, no hands, no fingers — simple curved flaps attached at the upper sides, mostly occluded by the body in front view.
- **No fingers, ever** — "Don't… give him fingers" (unofficial guideline distillation — STRONGLY SUPPORTED). When Duo "holds" things, the object is placed against the wing/body rather than gripped (INFERRED from §1.6/§1.9).
- **Feet — two pill-shaped / Tic-Tac ovals, orange, detached from the body** (VERIFIED via official guide Step 4). "We're going to have Duo look like he's mid-jump, so put one foot on an angle… (In Duolingo's illustration style, we occasionally have elements float above or below a character, such as Duo's feet!)"
- **No legs.** Feet float directly under the body blob; there is no leg segment (INFERRED from all public images).
- **Bend points:** "Can bend at waist/elbow/wrists" — i.e. the single body can squash/bend at the midline, and the wings can hinge — despite having no anatomical joints (unofficial distillation — STRONGLY SUPPORTED). This is a *rig* convention, not anatomy.
- **Head-turn:** "Ears are his most iconic feature; turn his head by dragging the top-middle anchor side-to-side — don't overdo it (pinch looks unnatural)" (unofficial distillation — STRONGLY SUPPORTED). The wavy ear-top is the turn handle.

### 2.3 Shape language

- **Entirely round.** Every contour is a circle, oval, pill, half-circle, or soft "shark-fin" curve. There are **no straight edges, no sharp points, no angles** in Duo himself (INFERRED from all public images; VERIFIED as a system rule — see §4.2: "pointy shapes are off-brand").
- The only quasi-angular elements are the **softened wing tips** and the **"m" eye-feather flicks**, both still fully rounded (INFERRED).
- Contrast within the system is by **size rhythm**, not by round-vs-angular: big eyes vs small beak vs tiny belly feathers; big body vs tiny feet (INFERRED; rhythm rule VERIFIED in §4.2).
- **System rules (STRONGLY SUPPORTED, via distillations of the formerly public guidelines):** only 3 base shapes — rounded rectangle (most common), circle, rounded triangle; everything rounded. Simplicity sweet spot ~15 shapes per illustration (~6 = too abstract, ~30 = too many). Rhythm: vary shape sizes "like notes in a melody".
- **Flat perspective:** depth only along the same line of sight; characters/icons drawn flat (STRONGLY SUPPORTED).

### 2.4 Rendering

- **Flat vector colour, no gradients.** The 2012 version had 3D gradients/texture; the 2013 redraw dropped them and the 2019 version kept every fill flat (DesignRush — STRONGLY SUPPORTED). Current Duo is flat fills throughout (INFERRED from all public images; **VERIFIED by file analysis in §3.1**: the official SVG contains zero gradients).
- **No outlines.** "No outlines: parts are separated by flat color only" (secondary synthesis citing the former guidelines — STRONGLY SUPPORTED). The eye mask, beak, wings and belly feathers read purely by colour change, not by stroke. The official drawing guide's "outline his eyes" step refers to *drawing the mask boundary as a shape*, not an ink outline (VERIFIED via guide wording). **File analysis (§3.1) confirms: zero strokes in the official SVG.**
- **At most one shade step per colour; no textures; never use transparency to fake a darker tone — pick a solid darker colour** (STRONGLY SUPPORTED). Consistent with the single darker-green overlay in the analysed SVG (§3.1: `#50BB00`, one path).
- **Shading is a single darker flat shape**, e.g. the wing overlay when a wing crosses the body — with a specific prohibition: "don't… add a darker wing color when posed over his body" (unofficial distillation — STRONGLY SUPPORTED; i.e. the overlay is *not* applied arbitrarily).
- **Ground shadow is a pill, never an oval** (STRONGLY SUPPORTED, §4.2). In the analysed SVG the shadow is a `#AFAFAF` ellipse at `fill-opacity="0.3"` — the single transparency exception in the file, used for the ground shadow only (VERIFIED by file analysis, §3.1).
- **Line weight: effectively zero** — there is no stroke system on Duo; where a line appears (e.g. tongue line, mouth "U"), it is a thin shape, not a consistent stroke weight (INFERRED; confirmed by the SVG having no stroke attributes).
- **Backgrounds:** white negative space framing; illustration bases are pastels, never gray (STRONGLY SUPPORTED). "Gray reads lifeless/cold."

### 2.5 Eyes / beak geometry (VERIFIED via the official 10-step guide)

- **Eyes — the largest feature relative to the face** (STRONGLY SUPPORTED). Official guide Steps 5–7:
  - Two **large white ovals** for eye whites. Spacing trick: "pretend there's a third oval right in the middle of the two eyes."
  - Two **smaller ovals for pupils** inside, filled in, each with a **tiny white highlight circle at the top-left** ("a twinkle in his eye").
  - **Left eye just a tiny bit smaller** than the right in the standard ¾ view — "since Duo is positioned on an angle, this will help with perspective."
  - **Eye mask:** Step 6 — "Give Duo his signature eye mask by outlining the area around his eyes" — a lighter-green (Mask Green `#89E219`) region enclosing both eyes, curving upward between them.
  - **Eye feathers:** Step 7 — "little feathers on the top of his eyes… kind of look like stretched-out lowercase m's!" — two small "m"-shaped flicks above each eye.
  - **Do NOT centre pupils** — "looks creepy" (unofficial distillation — STRONGLY SUPPORTED). Pupils sit off-centre; their placement + eyelids + shine carry emotion.
- **Beak — centred between/below the eyes, deliberately overlapping the mask curve** (VERIFIED via official guide Steps 8–9):
  - Top half: a **half-circle** "right in the middle of the eyes, where the eye mask curves upward."
  - Bottom: "basically 2 uppercase U's: one on the outside, one on the inside, and a tiny line for his tongue!"
  - **Asymmetry is intentional:** "This piece shouldn't line up perfectly with the half circle — you want the top of his beak to stick out a little bit on the left side. (This also helps with perspective!)"
  - Colour split (STRONGLY SUPPORTED, unofficial transcription): upper beak yellow `#FFC200` with highlight `#FFDE00`, lower beak / mouth interior orange `#F49000` / `#B66E28`, tongue pink `#FFCAFF`.

### 2.6 Pose construction — how identity survives

- **Side view / turnaround — VERIFIED mechanism (Murphy):** because the body is "more or less a cylinder with wings", a side view is *predictable*: same cylinder, one wing visible, beak in profile, one eye (or the mask edge) visible, feet still two pills. Identity is carried by **(a) the cylinder silhouette, (b) the green + orange-beak/feet colour block, (c) the oversized eye(s) + mask** — none of which depend on seeing both eyes (INFERRED from the cylinder logic + observed side-view art in Advertising Week's "Duo perspective study" image).
- **Dynamic poses:** the body squashes, stretches, bends at the waist; feet detach and float; wings lift as half-circles. Because there are no limbs with fixed proportions, squash-and-stretch can be extreme without breaking anatomy — **there is no anatomy to break** (INFERRED from the "chicken nugget" construction + observed jumping/flying poses).
- **Extreme poses — VERIFIED examples:** Duo "combusting into flames to celebrate your long learning streak", "a giant Duo chasing characters who didn't complete their daily lesson", doing backflips (Advertising Week, Hartman). A 2024 widget version shows Duo "warped and wavy as though he is melting" (design.duolingo.com article cover, "How we developed our addictive and delightful widget"). **Identity survives melting/flaming/giant-scale because the colour block (green body + orange beak/feet) + eye-mask + ear-wave remain legible even when the silhouette is distorted** (INFERRED).
- **App-icon test:** a close crop of the beaky face became the app icon; "Duo's eye mask touches left/right edges in a square" crop; "works down to 16px (favicon)" — at 16px, only the eyes + mask + green need to read (unofficial distillation — STRONGLY SUPPORTED). **Transferable principle: design the face to survive a 16px crop; design the body to survive a silhouette-only read.**
- **Measured pose-construction evidence from the analysed SVG (§3.1):** the sitting-Duo scene is built from 30 paths total for character + books + shadow, with the body green (`#58CC02`) as 4 paths spanning 379×386 units in a 1080×1080 viewBox — i.e. the character occupies roughly a third of the canvas width, and the eye-whites (`white`, 2 paths) span 222×129 units: eyes are ~58% of body width. That ratio is a **measurement from one official file**, not a Duolingo-published spec — treat it as observed data, not a rule.

---

## 3. Deep asset forensics (coordinator's own measurements, 2026-11-21)

All files below were served publicly by Duolingo's own CDN/blog. Plain HTTPS GET, analysed locally, never republished. Method and exact URLs are given so any finding can be re-checked.

### 3.1 Official Duo SVG — structure (VERIFIED, measured)

**File:** `https://d35aaqx5ub95lt.cloudfront.net/images/pathCharacters/active/2b8208acfd8a19539a7f1f0f583eedaa.svg`
(Sitting Duo reading a book; served gzip-compressed, decompressed before parsing.)
**Tool:** Python `xml.etree`, regex bounding-box extraction from path data.

| Measurement | Value |
|---|---|
| Canvas | `width=1080 height=1080 viewBox="0 0 1080 1080"` |
| Total elements | 31 (30 `<path>` + root `<svg>`) |
| Groups (`<g>`) | **0** — flat list, no layer structure |
| IDs / classes | **0** — no named parts |
| Gradients | **0** |
| Strokes (`stroke` attribute) | **0** |
| Transparency | 1 path only: ground shadow `#AFAFAF` at `fill-opacity="0.3"` |
| Comments / metadata / editor tags | none |

**Fill inventory (14 distinct fills for a full scene: character + 3 books + shadow):**

| Fill | Paths | Approx. bbox (units, 1080 canvas) | What it is |
|---|---|---|---|
| `#58CC02` | 4 | x[356,735] y[308,693], 379×386 | Body green (Feather Green) |
| `#89E219` | 1 | x[431,694] y[418,624], 263×207 | Eye mask (Mask Green) |
| `white` | 2 | x[458,680] y[457,587], 222×129 | Eye whites |
| `#4B4B4B` | 2 | x[505,663] y[505,576], 158×71 | Pupils (Eel, not black) |
| `#FFC200` | 4 | x[353,749] y[545,804], 397×259 | Beak upper yellow (+ book pages) |
| `#FFDE00` | 1 | x[574,604] y[570,588], 30×19 | Beak highlight |
| `#F49000` | 3 | x[463,697] y[574,724], 234×151 | Feet / beak lower |
| `#50BB00` | 1 | x[441,489] y[604,645], 48×41 | Single darker-green shade step |
| `#2B70C9` | 3 | x[463,709] y[564,738], 246×173 | Blue book (Humpback) |
| `#FF7878` | 3 | x[354,737] y[652,880], 384×228 | Pink/red book |
| `#F7F7F7` | 5 | x[366,862] y[367,754], 496×386 | Polar (book pages / highlights) |
| `#AFAFAF` | 1 | x[301,802] y[558,930], 501×372 | Ground shadow (opacity 0.3) |

**What this proves (VERIFIED):**
- A production Duo illustration ships as a **flattened export**: no groups, no named parts, no rig structure, no strokes, no gradients. The "system" lives in the authoring file (Figma — see §4.1), not in the shipped SVG.
- The whole scene (character + props + shadow) is ~30 shapes — consistent with the "~15 shapes per illustration" guideline sweet spot, scaled up slightly for a scene with props.
- **One shade step only** (`#50BB00`, a single small path). Note the measured shade is `#50BB00`, **not** the `#43C000` "wing overlay" quoted in unofficial distillations — the secondary sources are wrong on this value, or the value varies by asset. Do not cite `#43C000` as canonical.
- Pupils are `#4B4B4B` (Eel), never pure black — matches the guideline transcription.

**What this does NOT prove:** this one SVG cannot tell us how the authoring file is layered, whether a rig exists upstream, or how many poses share parts. The shipped file is deliberately flat.

### 3.2 Official PNGs — colour census (VERIFIED, measured)

**Tool:** Python PIL, opaque-pixel colour census. Note: blog-cover PNGs are re-encoded by the CDN, so sampled values drift a few units from canonical hex — the SVG (§3.1) and brand guides are the canonical sources; PNG sampling is corroboration only.

| File | Size | Finding |
|---|---|---|
| `duo-run.png` — https://blog.duolingo.com/content/images/2021/05/Eddy-Duo---Run--1-.png | 1946×1537 | Exact `#58CC02` present on 100,476 px; Duo-green bbox x[1161,1674] y[834,1299] (513×465 px, right side — human runner occupies the left). Top colours: `#FF4B4B` 32.6% (runner's red), `#FFC6B7` 25.1% (skin), `#58CC02` 12.3%, `#89E219` 3.2%. 2,337 unique colours (anti-aliasing + photographic-style shading on the human). |
| `duo-yir.png` — Ghost CDN `cover_yir.png` (Year in Review) | 900×600 | File is a **semi-transparent overlay**: uniform alpha 229 across 539,400 px. RGB underneath: dark navy `#091860` background; Duo greens read as `#58CD02` (11,600 px — off by 1 from canonical), `#24A600`, `#95EE25`. The ±1–few-unit drift is CDN re-encoding noise, not a different palette. |
| `duo-wave.png` — Ghost CDN `Cover_Goodbye-in-English.png` | 900×600 | 496 unique colours. Background `#DB7DFF` 69%. Duo greens render as `#00CF00` 11.3% / `#67E500` 4.4% (shifted from `#58CC02` by cover colour treatment/compression); green bbox x[191,673] y[82,472] (482×390 px). **Lesson: never take a canonical hex from a blog-cover PNG — only from the SVG source or the brand guide.** |
| PNG metadata | — | No `Software` / author / creation-tool chunks in any of the three PNGs (`info` = dpi only; one has an EXIF block with no tool string, one has an ICC profile). **No export-tool evidence in file metadata.** |

### 3.3 Public web runtime inspection (VERIFIED, measured — with a hard limit)

**Method:** fetched `https://www.duolingo.com/` and `https://www.duolingo.com/learn` (both return an ~11 KB app shell), downloaded every JS bundle the shell references (`app-*.js`, `features-*.js`, `4779-*.js`, `8553-*.js`, `9819-*.js`, `manifest-*.js`, `polyfills-*.js`, `strings/en-*.js` from `d35aaqx5ub95lt.cloudfront.net`), grepped for `rive`, `lottie`, `.riv`, and image-asset paths.

**Result:** **zero** occurrences of `rive`, `lottie`, or `.riv` in the public shell bundles, and no image-asset paths embedded in them. The shell is a loader; the lesson runtime (where character animation would live) loads after authentication and was **not** probed — it is not publicly accessible without an account, and probing it is out of scope.
**Conclusion:** the public web shell yields **no evidence either way** about the in-app animation runtime. The Rive/Lottie evidence in §4 comes from Duolingo's own blog and vendor case studies, not from this inspection. Recorded here so the gap is explicit, not hidden.

### 3.4 What was searched for and NOT found in public assets

- No publicly served `.riv` file was found via the public shell or blog CDN (see §3.3 limit).
- No publicly served Lottie JSON (`.json` with `v`/`layers` structure) attributable to Duolingo was located; LottieFiles hosts Duolingo's animations behind its own platform, not as direct public files.
- No public model sheet / turnaround / expression sheet / pose-library file for Duo was found anywhere (see §5.3).

---

## 4. The pipeline — a three-track model (synthesis, labelled)

No single source states this summary. It is my synthesis of the verified sources below; each track is tiered separately.

### Track A — Static illustration: Figma vector, minimal shapes (VERIFIED)

- **"Shape language: Duolingo's art style"** (Duolingo Blog, 2020-07-02): the team moved from hi-res painted raster illustrations to **vector illustration** because vector is mathematically calculated curves, scalable to any phone/tablet size; the style is deliberately minimalistic — *"quick to produce, clear to understand, and fun to learn with"* — using the fewest details needed, with clear silhouettes and white negative space. *"Switching to vector-based illustration software also helped speed up our pipeline."* / *"we can scale up and down for various phone and tablet screen sizes."* / *"using the fewest details needed to get the point across."* The article names **no specific vector software** — the tool identity comes from job listings + the intern post below.
- **Figma is "the main illustration tool at Duolingo"** (VERIFIED — Duolingo Blog, Thrive intern post by Taylor, 2023-04-14, "Interning with Duolingo: designing new characters and building love for old ones"): *"I brought my initial sketches into Figma, the main illustration tool at Duolingo."*
- **Character sheets exist for the main cast** (VERIFIED — same post): characters are *"constructed of simple geometric building blocks"*; vendors previously designed background characters per-scene *"with very minimal style guidelines beyond the main cast's character sheets"* — direct evidence that character sheets exist, and that a reusable **character library** was created so artists/contractors could reuse designs instead of designing new ones per use-case.
- **2013 process** (VERIFIED — "Reshaping Duo," 2013-11-20): *"Iterations were made for months… Each day, the progress was shown to the rest of the team… proceed to a revised draft, where a vector image was made."* Silhouette treated as the most important part.
- **2018 construction (VERIFIED — Murphy via Apple):** cylinder body + half-circle wings, chosen so that "animation and illustration time go down drastically" and Duo can appear in more places. This is the core scalability mechanism for Duo's many poses — **a fixed, minimal construction kit, not a new drawing per pose**. (The "kit" framing is my synthesis; the source states the effect.)
- **2019 in-house redraw (STRONGLY SUPPORTED):** Dec 2018 / Jan 2019, the in-house team simplified Duo into geometric shapes so he could be animated and express a range of emotions; Johnson Banks' work was the *logotype / brand system* (Feather Bold, drawn by Fontsmith from Duo's feather shapes), not the Duo character redraw itself. Do not attribute Duo's 2019 shape to Johnson Banks.

### Track B — Linear animation at scale: After Effects → Lottie (STRONGLY SUPPORTED)

- **LottieFiles case study** (verified by direct open, 2026-11-21 — https://lottiefiles.com/pt/case-studies/duolingo): *"Over the course of our journey with LottieFiles, we have seamlessly integrated thousands of files into our ecosystem. Using tools like Lottie Preview, Lottie Editor, and the LottieFiles test app for iOS and Android, we can test, experiment, and troubleshoot our work quickly and easily before implementation."* / *"Lottie helps us keep file sizes small and ensure reliable performance everywhere."* The "thousands" figure is vendor-reported, not Duolingo-audited.
- **Animator quote** (STRONGLY SUPPORTED — direct quote from named Duolingo animator Kurt Hartfelder, published by LottieFiles/HackerNoon, 2021-03-14): *"LottieFiles plays a critically important role in our animation pipeline here at Duolingo… I can animate in After Effects and proof my own work before handoff…"* — https://hackernoon.com/meet-lottie-the-open-source-file-that-is-changing-animation-as-we-know-it-o83735uy
- **Streak-milestone process** (STRONGLY SUPPORTED): for streak milestones, Duolingo replaced Duo holding number balloons with Duo transforming into a flaming phoenix; several rough animation passes to explore variations before refining rhythm/energy, then polish, then a share card. (Attributed to Hartfelder's blog post "You're on fire!"; process detail via secondary summary — not opened to primary text.)
- **LottieFiles social, 2025-07-11** (secondary summary): carousel "How Duolingo uses Lottie animations" — 365-day streak reward (Duo flips into a golden winged owl with sunglasses), Duolingo Max promo, Gold League leaderboard, "Completion reward / Speaking star!" screen. LottieFiles' official reply in comments clarified **dual usage** of Rive and Lottie (per the search summary; the comment itself was not opened — treat as STRONGLY SUPPORTED at most).

### Track C — Interactive characters: Rive + State Machine (VERIFIED for World Characters; Duo's own status UNKNOWN)

- **"How Duolingo Animates Its World Characters"** (Duolingo Blog, 2022-11-10; **re-read in full by the coordinator, 2026-11-21** — https://blog.duolingo.com/world-character-visemes/): manually animating lip movement for 10 World Characters across 40+ languages / 100+ courses / thousands of sentences was *"completely out of the question."* Duolingo chose **Rive** because: compact files, neat fit with app architecture, seamless animator→engineer handoff, and above all the **State Machine** — programmatic control of which animation states are called, how they are called, and how they blend. Pipeline: generate speech → in-house speech-recognition/pronunciation models give word + phoneme timings → each phoneme mapped to a **viseme** (designed set based on linguistic features) → a "factory" generates all viseme timings for course content, with tools to audit/correct. Design: **20+ mouth shapes per character**, each character's own set matching their personality; separate animation states for general poses and for mouths, running in parallel; exported from Rive as a **single runtime file**, handed to engineers. At runtime, audio + timing trigger the state machine in sync; idle behaviours (head nods, blinking, eyebrows) run alongside; correct/wrong outcome moves to a reaction state. Quotes: *"The State Machine's powerful system is what allowed this project to be feasible on a grand scale."* / *"it is exported from Rive into a single runtime file, then handed off to the engineers."*
- **Duocon 2023 talk** (STRONGLY SUPPORTED — not watched in full): "How we animate the Duolingo world — The innovative tech behind our characters" (YouTube `fgOqvyPif3g`, linked from the visemes post). Reported as presenting Rive as the scale mechanism: finite animation talent, "mix and match" existing work into "nearly unlimited number of combinations," reducing visible repetition without more manual work; also used for DuoRadio.
- **Rive case study: Video Call with Lily** (STRONGLY SUPPORTED — vendor case study, 2025-03-13, quoting Senior Animator Jasmine Vahidsafa at length): *"so core to our workflow, I can't imagine doing this project without it."* Method: break reactions into **modular pieces** and let the State Machine handle transitions, instead of animating every reaction manually; **8 head animations × 8 body animations combine into 64+ idle variations**; **nested artboards** separate head and body for independent movement; event-triggered expressions sync AI responses to animation; final file **under 1 MB**; weekly "Riv Deliv" handoff (every Monday the latest .riv file to the team); Duolingo hired **creative technologists** to optimise Rive files. — https://rive.app/blog/duolingo-s-ai-powered-video-call-brings-lily-to-life
- **Rive documentation on the lip-sync mechanism** (STRONGLY SUPPORTED): skeletal animation (bones, meshes, IK, Auto Weights) built in; lip-sync = draw one mouth shape per sound group and switch them in the State Machine, with the app sending timing from audio/TTS. "Duolingo's characters lip sync this way." — https://rive.app/use-cases/character-animation
- **Scope limit (critical):** the 2022 post is about the 10 World Characters' lip-sync, **not** specifically about Duo the owl's many static poses. It proves the *interactive-character* pipeline, not that every Duo pose is a Rive file. Whether Duo's own in-app poses/animations are Rive files, Lottie files, or hand-posed Figma/After Effects exports is **not directly stated anywhere found**. Do not assume Duo = Rive.

### Track D — 3D: an intern experiment, NOT the production pipeline (VERIFIED)

- **Duolingo Blog, 2023-02-24, "Interning with Duolingo: bringing our characters to a new dimension"**: Thrive intern Monica introduced 3D animation as a brand-new technique — built Zari from scratch in 3D (modelling, texturing, rigging, lighting), staying true to official 2D turnarounds; used **toon shaders** (cel-shaded, flat) + graphic lines where colours overlap; **fully articulated rig with 145 controls**, built so artists with little 3D experience could use it; the 3D model was intended as a *reference for creating top-down (path) 2D animations*; process was thumbnails → self-recorded acting reference → blocked key poses in CG → polish → render 253 frames at 24fps for a ~10s video → composite over a 2D painted background. Quote: *"I fully articulated Zari so that she could move however we desired. Zari has a total of 145 controls."*
- **Scope limit:** the post frames this as the *first* 3D animator on the team, a 6-week exploration, "introducing" the pipeline. It does **not** show 3D became Duo's production pipeline. The 3D software used (Blender/Maya/etc.) is **not named** in the post. Do not cite this as "Duolingo uses Blender/3D for Duo." Whether 3D continued after 2023 is UNKNOWN — no follow-up post found.

### Track E — Project World cast system (VERIFIED / STRONGLY SUPPORTED)

- Greg Hartman designed the World cast (Lily, Zari, Bea, Eddy, Junior, Lin, Lucy, Vikram, Oscar, Falstaff) keeping Duo's design elements (large eyes, simple body, detached feet); unusually, **design drove personality** rather than personality driving design (sharp-angled purple-haired girl → emo Lily; round bearded fellow → kind Vikram; blocky red-haired child → energetic Junior); many shapes/iterations before final designs; each character got a hired voice actor + custom TTS voice built with Microsoft. (Hartman interview via The Verge; Duocon 2020 talk "Project World: Meet Duo the owl's friends!"; Animation World Network.)
- **Duo's personality rules (VERIFIED — Hartman, Advertising Week):** Duo is a **coach**: "He wants you to succeed… His mood is almost entirely tied to your learning habits" — tears when you skip, backflips when you practise. **Communicates via text only, never talks/narrates** (STRONGLY SUPPORTED, guideline distillation). He's a **day owl, not nocturnal; no signs/weapons; no sudden movements** (STRONGLY SUPPORTED).
- Hartman: "I don't think there is anything about the owl that resonates… it's kind of hard to tell that Duo is an owl." Relatability comes from personality/direct address, not owl-ness (VERIFIED). **Transferable lesson for ASCND:** species recognisability is secondary to personality + silhouette.

---

## 5. Design evolution timeline

| Year | What changed | Source | Tier |
|---|---|---|---|
| **2011 (original)** | Duo started as a **logo, a flat graphic with no expression**, letters **D-U-O making up his face**. Green chosen as a joke: co-founder Luis von Ahn picked green because co-founder Severin Hacker disliked green. Owl chosen because owls = wise, for an education app. | Apple Developer (2020-10-26, interviews with Hartman, Sims, Murphy); Advertising Week (2022-03-08) | VERIFIED |
| **2012** | First redesign: "real eyes and a prominent beak." Driven by iOS 7 app redesign needing a "fully executed 3D Duo" — got a "creepier textured version" (3D, gradients). First crying Duo (after a failed lesson) in reminder emails. Eyes "glared creepily into your soul." | Apple Developer; Advertising Week | VERIFIED |
| **2013** | "Reshaping Duo" — months of iterations, daily team review, vector draft, silhouette-first. | Duolingo Blog, 2013-11-20 | VERIFIED |
| **2014** | Identity-crisis fix: "we made a design decision to illustrate everything" (instead of mixing gamified elements with photos). "Conscious choice to embrace the gamified identity of Duo." Cute factor "significantly increased." Softer side, more unique silhouette — groundwork for final form. | Apple Developer; Advertising Week | VERIFIED |
| **2018–2019 (current Duo)** | **Dating discrepancy to note:** Apple labels this "2018" as part of a whole-app visual refresh; Hartman says "In 2019 we redesigned our entire app and I saw an opportunity to give Duo a facelift"; Rebrand Log / Design Week place the in-house Duo redraw in **Dec 2018 / Jan 2019**, with the Johnson Banks brand system in **Sept 2019**. Treat as one 2018–19 programme, not two separate redesigns. | Apple Developer; Advertising Week; Rebrand Log | VERIFIED (that a late-2010s redraw happened; exact month/year labelling differs by source) |
| **2019 (brand system)** | Johnson Banks (London) + Fontsmith redrew the logotype from Duo's feathery form → Feather Bold; new logo lockups, revised colours, illustration guides, tone of voice. Problem solved: owl/core colour/illustration "broadly working" but there were **no clear rules for using the brand away from the app**. | Creative Bloq; Branding.news / Johnson Banks | VERIFIED |

**Why the current design changed — VERIFIED (designer statements):**
> "Previously, we had two versions of this owl all over the place: happy state and crying state. He didn't have the full spectrum of emotions like you'd see in a videogame. He wasn't really a fleshed-out character. Duo was closer to the Twitter bird, where you only see him in one version, posture, and expression." — Tyler Murphy, Apple Developer
>
> "In 2019 … I was more intentional with all his shapes while also upping his cute factor. I began to think of Duo more as a character and less as a logo. With this redesign I made sure to try out all kinds of expressions and poses to make sure we were landing on a design that we could stick with for another 10 years or more." — Greg Hartman, Advertising Week

**Design intent distilled (VERIFIED):** animatability and emotional range were the drivers — not just a prettier static logo. Simplicity is a production decision (fewer shapes → faster illustration/animation, more placements), not only an aesthetic one.

---

## 6. Patents, open source, conference talks, job listings

### 6.1 Patents — no animation/character patent found

**Method:** two targeted Google Patents / WIPO searches (2026-11-21): "Duolingo patent animation character lip sync viseme" and "Duolingo Inc assignee patents Google Patents language learning".

**Result:** **No Duolingo-owned patent on character animation, lip-sync, or mascot systems was found.** The lip-sync/animation patents the searches returned belong to other assignees:
- US6307576B1 (2001, expired) — "Method for automatically animating lip synchronization…" — assignee MCRO Inc, inventor Maury Rosenfeld.
- US10839825B2 (2020, Jali Inc / University of Toronto) — "System and method for animated lip synchronization."
- US10770092B1 (2020, Amazon Technologies) — "Viseme data generation."
- US20210225198A1 / US11587460B2 — adaptive language learning — assignee IXL Learning Inc (originally Curiosity Media).
- US20160343272A1 — language-device operation — assignee CloverAi LLC (originally Gammakite).

The only Duolingo-adjacent patent record surfaced is **WO/2018/089133** — "Measuring language learning using standardized score scales and adaptive assessment engines" (PCT/US2017/054616, published 17.05.2018) — which is about **assessment**, not animation. Its applicant/assignee was **not confirmed** in the fetched WIPO text, so it is recorded here as "Duolingo-adjacent, unconfirmed assignee," not as a Duolingo patent.

**Interpretation (INFERRED):** Duolingo's character-system advantage is apparently protected by **trade practice + brand + speed of execution**, not by patents on the animation method — consistent with their strategy of publishing how it works on their own blog (Track C). But absence from two searches is not proof of a zero-patent portfolio; a full assignee search on USPTO/WIPO would be needed for certainty. Recorded as UNKNOWN (no animation patent found) rather than "Duolingo holds no such patents."

### 6.2 Open source released by Duolingo — nothing about characters/animation

**Method:** public GitHub API, `api.github.com/orgs/duolingo/repos?per_page=100`, fetched 2026-11-21. **12 public repositories, 0 related to illustration, animation, Rive, Lottie, or character systems:**

| Repo | Stars | What it is |
|---|---|---|
| halflife-regression | 585 | Learning-retention research model |
| metasearch | 541 | Search aggregator for Slack/Google Docs/GitHub |
| rtl-viewpager | 346 | ViewPager with RTL support (Android) |
| pre-commit-hooks | 70 | Code-quality tooling standardisation |
| pulldozer | 56 | CLI for batch editing multiple repos |
| duolingo-sharedtask-2020 | 51 | Shared-task dataset (https://sharedtask.duolingo.com) |
| slack-ai-agent | 48 | Slack AI agent with MCP connections |
| splinter | 41 | Pattern-based linter |
| minject | 10 | Python dependency-injection framework |
| slack-mcp | 9 | OAuth multi-user Slack MCP server |
| rollbar-ios | 2 | Objective-C Rollbar crash-reporting library |
| whosaidit | 0 | Multilingual speaker-attribute dataset |

**Conclusion (VERIFIED, negative finding):** Duolingo's open-source footprint is dev-tooling + research datasets. **No character rig, animation runtime, illustration library, or design-system code is open-sourced.** ASCND cannot "just use Duolingo's system" — the system is proprietary practice, and the transferable part is the *method* (Sections 4, 8), not code. (Note: the engineering blog links public PRs under `github.com/duolingo/duolingo-ios` — e.g. in the AI iOS unit-test generation post — but that repo was not enumerated by the public org API response above and was not inspected; do not treat it as an inspected source.)

### 6.3 Conference talks

| Talk | Status | Evidence |
|---|---|---|
| Duocon 2023 — "How we animate the Duolingo world — The innovative tech behind our characters" (YouTube `fgOqvyPif3g`) | **Not watched in full.** Title + description + link confirmed via the visemes blog post. Reported content: Rive as scale mechanism, "mix and match" combinations, DuoRadio. | STRONGLY SUPPORTED (reported content) |
| Duocon 2020 — "Project World: Meet Duo the owl's friends!" (Greg Hartman) | Listed on Duocon 2020 recap + duocon.duolingo.com/2020; YouTube `m-3-D7S0piw`. Not watched. | STRONGLY SUPPORTED (existence + topic) |
| **Gap:** no transcript of either talk was retrieved. A transcript fetch is the single highest-value remaining public source for the Rive pipeline. | — | UNKNOWN (content beyond reports) |

### 6.4 Job listings — the tool stack in Duolingo's own hiring language

**Method:** current/mirrored Duolingo postings, collected 2026-11-21. Job text is VERIFIED as a hiring document; it evidences what skills Duolingo *hires for*, not necessarily the exact production stack.

| Role | Tool evidence | Source |
|---|---|---|
| **Senior Motion Designer** (2025) | Requires "a strong foundation in After Effects, with interest or experience in Figma, Rive, and AI tooling"; exceptional candidates have "experience in animating and rigging interactions in Rive" and "experience writing specs and collaborating with engineers to implement animation to product"; role sits in **Design Studio**, "the creative team that brings Duolingo's world to life through motion, characters, and sound"; duties include "build, own, and maintain documentation of animation specs." | builtin.com / simplify.jobs / getro.org mirrors |
| **Illustrator** (current) | "Create engaging character and scene illustrations for Duolingo's app, website, brand, social media, marketing campaigns, workplace experiences, and animation." Requires "skill and proficiency illustrating with Figma" and "experience illustrating for animation"; reports to a Design Studio Manager. | builtin.com / mediabistro.com |
| **Illustrator / Motion Designer interns (Thrive)** | Illustrator interns: "experience illustrating in creative software such as Figma, Photoshop, or other comparable software." Motion Designer interns: "experience animating in creative software such as Animate, AfterEffects, Harmony, Rive, or other comparable software." | builtin.com / jobs.mitalent.org |
| **Motion Graphics Designer & Editor, Growth Marketing** | "Proficiency in the Adobe Suite, After Effects, Figma and video editing is a requirement"; "experience with character animation and working with illustration art." | jobs.drivecapital.com |

**Wording note (INFERRED):** After Effects is the *required foundation*; Rive is "interest or experience" for the base requirement and "exceptional" for rigging. That ordering suggests After Effects/Lottie remains the broad base, Rive the interactive-character specialism — consistent with the three-track model.

**Tools with NO public evidence as Duolingo production tools:**
- **Spine:** no public evidence Duolingo uses Spine. Searches returned only generic Spine tutorials and third-party "Duolingo-style in Rive" guides. UNKNOWN / no evidence.
- **Toon Boom Harmony:** appears only as one item in an intern listing's "such as" list. Evidence Harmony is an *acceptable applicant skill*, not production use. UNKNOWN.
- **Blender / Maya / Cinema 4D:** no evidence as production tools for Duo. The 3D intern post names no 3D software. UNKNOWN.
- **Adobe Illustrator:** no direct evidence as the illustration tool; Figma is the named main illustration tool, Photoshop named as comparable. UNKNOWN.
- **Procedural generation:** no public evidence of procedural/generative posing of Duo. The closest verified mechanism is *combinatorial* (Rive state-machine blending of modular pieces), which is not procedural generation. UNKNOWN / no evidence.

### 6.5 Brand resources / guidelines — current state (VERIFIED)

- Duolingo's public brand guidelines were hosted at `design.duolingo.com` (logo, colour, type, mascot-expression rules, motion, illustration style). **As fetched 2026-11-21, the domain no longer presents as a guidelines portal — it renders as "Articles about Design."** Former paths (`/identity/color`, `/illustration/shape-language`, `/writing/brand-narrative`, `/marketing/assets`) are visible only via web.archive.org snapshots cited by secondary sources. **No `brand.duolingo.com` guidelines site was found — that domain is not confirmed as a Duolingo brand resource.**
- **Implication:** all hex/type/logo rules below that come via secondary distillations are *transcriptions of* the former guidelines, not live-verifiable official pages today. Core hex values converge across every independent source, so they are safe to cite; finer do/don't rules are STRONGLY SUPPORTED, not VERIFIED.

**Core palette (VERIFIED / STRONGLY SUPPORTED — convergent across BRAND-Atoms, Canny Creative, UX Reference):**

| Name | Hex | Role |
|---|---|---|
| Feather Green | `#58CC02` | **The** brand colour. Primary CTA/accent, logo, Duo's body. "When in doubt, lean in to green." |
| Mask Green | `#89E219` | Secondary green; lighter-green face-mask area |
| Tree Frog | `#58A700` | Pressed/active variant; darker-shadow green |
| Eel | `#4B4B4B` | Typography / body text — used *instead of pure black* |
| Snow | `#FFFFFF` | Primary background |
| Polar | `#F7F7F7` | Off-white surface tint |
| Swan | `#E5E5E5` | Border / quiet divider |
| Hare | `#AFAFAF` | Mid grey — disabled / tertiary text |
| Wolf | `#777777` | Deep grey — secondary text |

**Secondary accents (STRONGLY SUPPORTED):** Macaw `#1CB0F6`, Whale `#1899D6`, Humpback `#2B70C9`, Blue Jay `#84D8FF`, Cardinal `#FF4B4B`, Fire Ant `#EA2B2B`, Bee `#FFC800`, Lion `#FFB100`, Fox `#FF9600`, Beetle `#CE82FF`, Sea Sponge `#D7FFB8`, Turtle `#A5ED6E`.

**Duo's own body palette (STRONGLY SUPPORTED — unofficial transcription only):** wing overlay `#43C000` (**disputed — the measured SVG uses `#50BB00`, §3.1**); body `#58CC02`; face mask `#89E219`; beak inner `#B66E28`; beak lower / feet `#F49000`; beak upper `#FFC200`; beak highlight `#FFDE00`; tongue pink `#FFCAFF`; pupil/ink Eel `#4B4B4B`; eye white Snow `#FFFFFF`. Do not present these to Kiệt as "published by Duolingo" without the qualifier.

**Colour rules (STRONGLY SUPPORTED):** apps always designed on white; illustration backgrounds light **pastels, never gray**; keep any single illustration to a **few** colours; Duo's green "vibrates" against many colours — place the mascot only on select secondary backgrounds; dark mode flips Eel to canvas and Snow to text; Feather Green stays primary.

**Typography (VERIFIED existence + 2019 + Johnson Banks/Fontsmith; specs STRONGLY SUPPORTED):** **Feather Bold** — bespoke display face, lowercase, short (≤10 words), left-aligned, never justified, line-height 100–110%, tracking −20; designed 2019 by Fontsmith (Krista Radoeva) with Johnson Banks, inspired by Duo's feathered forms; proprietary, not publicly available. **DIN Next Rounded** ("DIN Round Pro" / "duolingo-sans" in different sources — **naming discrepancy to flag**) — body/UI, leading ~140%, tracking 0, never <14px; free substitute commonly cited: Nunito. Never combine Feather Bold and DIN in the same sentence; buttons ALL CAPS, no punctuation, bold, +0.8px tracking.

---

## 7. Tiered findings — master table

### 7.1 VERIFIED (direct evidence or own measurement)

| # | Finding | Source |
|---|---|---|
| V1 | Duo is built from a few simple shapes: a circle/cylinder body + half-circle "shark-fin" wings + pill feet; "basically a chicken nugget with a face." The 2018 geometry was chosen explicitly to cut animation/illustration time drastically. | Hartman (Advertising Week); Murphy (Apple Developer); official drawing guide |
| V2 | The official 10-step drawing guide constructs Duo as: circle → wavy ear-top → shark-fin wings → pill feet (one angled) → 2 large eye ovals + pupils + top-left highlight → eye-mask outline → "m" eye feathers → half-circle upper beak → double-U lower beak + tongue → 3 belly half-circles. Asymmetry (left eye slightly smaller, beak sticking out left) is intentional for perspective. | blog.duolingo.com/how-to-draw-duo-the-owl/ (re-read in full) |
| V3 | Vector-first, minimal-shape illustration: switch from painted raster to vector; fewest details needed; clear silhouettes; white negative space. | "Shape language" blog, 2020-07-02 |
| V4 | Figma is the main illustration tool; character sheets exist for the main cast; a reusable character library was built so artists/contractors reuse designs instead of designing per use-case. | Intern post, Duolingo Blog, 2023-04-14 |
| V5 | Rive + State Machine + phoneme→viseme factory for the 10 World Characters: 20+ mouth shapes each, separate pose/mouth states in parallel, single `.riv` runtime file, runtime triggering from audio timings, idle behaviours alongside. | "How Duolingo Animates Its World Characters," 2022-11-10 (re-read in full) |
| V6 | 3D (Zari, 145-control rig, toon shaders) was a 6-week intern exploration in 2023, intended as reference for 2D path animations — not the production pipeline; software unnamed. | Duolingo Blog, 2023-02-24 |
| V7 | LottieFiles case study (vendor page, opened directly): "thousands of files" integrated; Lottie Preview/Editor/test app used for testing before implementation; small file sizes, reliable performance. | lottiefiles.com/case-studies/duolingo |
| V8 | Production Duo SVG (official CDN) ships flattened: 1080×1080, 30 paths, 0 groups, 0 IDs, 0 gradients, 0 strokes, 1 shade step (`#50BB00`), 1 transparency (ground shadow only). | Own measurement, §3.1 |
| V9 | Job listings: After Effects = required foundation for motion; Figma = required for illustration; Rive = "interest/experience" (exceptional: rigging in Rive); Design Studio owns motion/characters/sound + animation-spec documentation. | Current Duolingo postings (mirrors) |
| V10 | Duolingo's public GitHub org has 12 repos, all dev-tooling/research datasets; **zero** character/animation/design-system repos. | api.github.com/orgs/duolingo/repos, 2026-11-21 |
| V11 | `design.duolingo.com` no longer serves the public brand guidelines (now a design-articles blog) as of 2026-11-21. | Direct fetch, 2026-11-21 |
| V12 | Colour census of official PNGs confirms Duo green `#58CC02` in the source art (100,476 px in the run image); blog-cover re-encodes drift a few units (`#58CD02`, `#00CF00`), so canonical hex must come from SVG/guide, never from a cover PNG. | Own measurement, §3.2 |

### 7.2 STRONGLY SUPPORTED

| # | Finding | Basis |
|---|---|---|
| S1 | Lottie/After Effects is the broad linear-animation base ("critically important… in our animation pipeline," Hartfelder; thousands of files). | Named-animator quote via vendor channel + case study |
| S2 | Rive modular-actor method for Lily Video Call: 8 head × 8 body = 64+ idle variations, nested artboards, <1 MB file, weekly "Riv Deliv" handoff, creative-technologist hires. | Rive case study, 2025-03-13 |
| S3 | Duocon 2023 presented Rive as the scale mechanism ("mix and match" into nearly unlimited combinations). | Talk listing + blog link; talk not watched |
| S4 | Brand-guideline rules as transcribed: 3 base shapes only, ~15 shapes sweet spot, pill (never oval) shadows, pastels never gray, 5 eye styles, no fingers, max 4 fingers on other characters, pupils never centred vertically. | Multiple independent distillations citing the former guidelines |
| S5 | Duo body-part hexes (beak `#FFC200`/`#FFDE00`/`#F49000`/`#B66E28`, tongue `#FFCAFF`, mask `#89E219`) — **except** wing-overlay `#43C000`, which the measured SVG contradicts (`#50BB00`). | Unofficial distillations, convergent |
| S6 | Identity survives extreme distortion (flaming, melting, giant-scale) because colour block + eye-mask + ear-wave stay legible. | Reported examples + inference from construction |
| S7 | The 2019 in-house Duo redraw (Dec 2018/Jan 2019) simplified Duo into geometric shapes for animation + emotional range; Johnson Banks did the brand system, not the character. | Design Week / Creative Bloq / Rebrand Log |
| S8 | 3D status after 2023 is unknown; no follow-up post found. | Absence in search |

### 7.3 INFERRED (from observed output)

| # | Finding | Basis |
|---|---|---|
| I1 | The scalability mechanism is the fixed minimal construction kit, not a new drawing per pose. | V1 + V3 + observed pose range (§1) |
| I2 | Emotion = eyes + beak + optional eyebrows/steam/tears/sweat; body/beak/feet never change. | §1 cross-category observations |
| I3 | Celebration/action is expressed by raised wings, open beak, floating feet, accessories and props — not body redesign. | §1.3, §1.6, §1.8 |
| I4 | Side view is predictable because the body is a cylinder; identity rides on silhouette + colour block + eye/mask. | V1 + observed side-view art |
| I5 | Squash-and-stretch can be extreme because there is no anatomy to break. | V1 + observed jumping/flying poses |
| I6 | After Effects/Lottie is the broad base and Rive the interactive specialism (from job-listing wording order). | V9 |
| I7 | Measured eye-white width ≈58% of body width in one official SVG — observed data, not a rule. | §3.1 measurement |

### 7.4 UNKNOWN (insufficient public data)

| # | Unknown | What would resolve it |
|---|---|---|
| U1 | Whether Duo's *own* in-app poses/animations are Rive, Lottie, or hand-posed Figma/AE exports. | Duocon 2023 talk transcript; a Duolingo post about Duo specifically (not World Characters); animator interview naming Duo's format. |
| U2 | Contents/format of Duo's character sheet / model sheet / pose library / rig (if a formal rig exists). | Any published sheet; the Duocon talk; designer portfolio showing a Duo turnaround. |
| U3 | Exact numeric construction spec for Duo (eye/body ratios, turnaround dimensions, expression sheet). | Published measurements (none exist publicly); our own measurement programme on public images. |
| U4 | Tool versions / file formats for final shipped Duo art (SVG? Figma export? redrawn in Rive/AE?). | Designer workflow post; job listing naming the pipeline. |
| U5 | Whether 3D continued after the 2023 intern project. | Follow-up blog post; 3D Duo in product. |
| U6 | Procedural / AI generation of Duo art in production. | No evidence found; any claim would be fabrication on current evidence. |
| U7 | Duolingo's patent position on character animation (no animation patent found in two searches — not proof of zero). | Full USPTO/WIPO assignee search. |
| U8 | Marketing/social Duo pipeline (costume, video, TikTok) vs. in-app pipeline. | Social-team interview; BTS post. |
| U9 | Side/¾-view construction details (mask/beak resolution in profile, visible eye-feather count). | Published turnaround; more side-view public images. |
| U10 | Current canonical home of the public brand guidelines (if they still exist under a new URL). | Duolingo site search; archive check. |

---

## 8. Transferable principles for ASCND / Koa (principles only — not copying Duo)

These are *principles* distilled from the verified findings above, for the parent agent to judge against Koa's actual assets. Nothing here copies Duo's artwork, colours, or character design.

1. **One-shape body:** a single cylinder/nugget with the face *on* it removes the head/body-ratio problem entirely and makes turnarounds predictable. Koa's core problem (§2 of the mission: proportions drift between poses) is exactly what this construction eliminates — if Koa's construction allows it. Whether Koa can be reduced this far without losing its identity is a Phase II question, not answered here.
2. **Eyes carry emotion; everything else is secondary.** Oversized eyes + off-centre pupils + highlight = the expression system. Design the eye system first, before posing the body.
3. **Few shapes, flat colour, no outlines, one shade step max** — chosen for animation/production speed, not just looks. A shipped Duo scene is ~30 flat paths with zero strokes and zero gradients (§3.1). If Koa's assets have gradients, strokes, and many shade steps, every new pose multiplies that complexity.
4. **Identity = silhouette + 2-colour block + eye-mask.** If it survives a 16px crop and a melting/flaming distortion, the identity system works. Test Koa the same way: silhouette-only read, 16px crop read.
5. **Feet/wings as detached primitives** (pills, half-circles) allow extreme squash-and-stretch without anatomy to break. Detached, floating parts are a feature, not a bug — Duolingo's own guide says so.
6. **Colour from the mascot, type from the mascot** (Feather Bold drawn from Duo's feather forms) — the character generates the whole brand system, not the other way round.
7. **Publish the rules, not just the art:** Duolingo's leverage came from guidelines (3 shapes, ~15 shapes, pill shadows, pastels-not-gray) that let many illustrators produce consistent work fast. A character sheet + a short rule list beats a folder of example images.
8. **Three tracks, not one pipeline:** (a) fixed minimal vector construction (Figma) → many static poses cheaply; (b) After Effects → Lottie for linear micro-animations at thousand-file scale; (c) Rive state machines → interactive, lip-synced characters from modular, combinable pieces. ASCND should decide per use-case which track a Koa pose/animation belongs to — and should not assume one tool covers all three.
9. **Modular combinatorial scale:** 8 head × 8 body = 64+ idle variations from 16 pieces (Lily Video Call). For Koa, the equivalent is: design a small set of interchangeable heads/bodies/expressions and let the state machine combine them, instead of drawing 64 poses.
10. **Character library before pose library:** Duolingo's fix for inconsistent vendor art was a reusable character library + character sheets for the main cast — i.e. fix the *construction*, then the poses follow. Koa's Phase II should do the same: master reference + rules first, poses second.
11. **A shipped asset is flat; the system lives upstream.** The production SVG has no groups, IDs, or rig — so "the SVG looks simple" tells you nothing about the authoring system. Judge Koa's system by its authoring files and rules, not by the exported SVG.
12. **Do not copy the *values*, copy the *method*:** Duo's exact shapes, colours, and eye geometry are Duolingo's IP. What transfers is: minimal fixed construction, eye-first expression, flat rendering, published rules, modular state-machine animation, and a character library.

---

## 9. Biggest unknowns — ranked by impact on the Koa decision

1. **U1 — Duo's own format (Rive vs Lottie vs hand-posed).** This is the single most decision-relevant unknown: it determines whether ASCND should invest in Rive rigging for Koa or in a cheaper static-pose system. The visemes post proves Rive for World Characters, not for Duo.
2. **U2 — The character sheet / pose library itself.** No public sheet exists; we know sheets exist (V4) but not their contents. Koa's Phase II must *create* this artefact from scratch — there is no public template to copy.
3. **U3 — Numeric construction spec.** No official ratios exist. Any Koa ratio must be measured from Koa's own assets (Phase II), not borrowed from Duo.
4. **U6 — Procedural/AI generation.** No evidence Duolingo uses it for Duo. Any proposal to AI-generate Koa poses must stand on its own evidence, not on "Duolingo does it."
5. **U5 — 3D after 2023.** The 3D experiment's fate is unknown; do not use it to justify a Koa 3D pipeline.

## 10. Method & limits statement (for the final report)

- **Searched, not accessed:** everything in this document comes from public web pages, public APIs (GitHub org API), public patent databases, and files Duolingo itself serves publicly on its CDN/blog. No login, no paywall bypass, no leak, no employee-only system was used. The login-gated lesson runtime was not probed.
- **Verified by re-reading:** the two most load-bearing primary sources (visemes/Rive post; how-to-draw-Duo guide) were re-opened and read in full by the coordinator on 2026-11-21, and the LottieFiles case study was opened directly.
- **Measured, not asserted:** the SVG structure, PNG colour census, and web-shell grep are first-hand measurements with exact URLs and tools recorded (§3), so they can be re-run.
- **Known weak points:** Duocon talks were not watched in full and no transcript was retrieved; some secondary summaries (Design Week, streak-milestone post, LottieFiles Instagram replies) were not opened to primary text; the "~15 shapes / 3 shapes / pill shadows" rules rest on secondary distillations of guidelines that are no longer live at their original URL; the wing-overlay hex `#43C000` is contradicted by direct measurement (`#50BB00`) and should not be cited as canonical.
- **Review protocol:** per the mission §11, every conclusion here may be challenged by Claude or any reviewer; the tier labels are the mechanism for that challenge — attack the tier, not the claim.
