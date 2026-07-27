# Koa — Outfit catalogue & new poses

Extracted verbatim from the design export `Koa_Mascot_Room.html` (the
bundled Mascot Room page, §5 OUTFIT · CỬA HÀNG). **This file is the id and
label contract only — the artwork is not in that export.**

The bundle ships the room page, which imports the character with
`<dc-import name="Koa" …>`; the `Koa` component itself is resolved by the
design tool at runtime and is not embedded (no path data, no keyframes, no
registry, no base64 in the file — checked). To draw any of this we need the
updated `Koa.dc.html` component export, the same kind of file the first zip
contained.

## New props on the character

| Prop | Values |
| --- | --- |
| `pose` | adds **`turn34`** — the §1 TURNAROUND 3/4 view, previously unbuilt |
| `expression` | adds **`strain`** — used by the lifting pose (was `confident`) |
| `head` `face` `top` `bottom` `shoes` `back` `hand` | one outfit slot each, values below |

Seven slots, ten items each. Slots are independent; items within a slot are
mutually exclusive. Note the repo's current shop models slots as
head/eyes/neck/waist with five items — that will need remapping.

## Items


### `head` — Đầu

| id | label |
| --- | --- |
| `band` | Sport Headband |
| `cap` | Baseball Cap |
| `beanie` | Knit Beanie |
| `santa` | Santa Hat |
| `antler` | Reindeer Antlers |
| `pumpkin` | Pumpkin Bucket |
| `witch` | Witch Hat |
| `khanxep` | Tet Turban |
| `phones` | Headphones |
| `lion` | Lion Dance Crown |

### `face` — Mặt

| id | label |
| --- | --- |
| `shades` | Sunglasses |
| `goggles` | Swim Goggles |
| `mask` | Face Mask |
| `eyepatch` | Eye Patch |
| `beard` | Santa Beard |
| `tuong` | Opera Mask |
| `vr` | VR Headset |
| `nosestrip` | Nose Strip |
| `heart` | Heart Glasses |
| `dragon` | Dragon Mask |

### `top` — Áo

| id | label |
| --- | --- |
| `tank` | Tank Top |
| `tee` | T-Shirt |
| `hoodie` | Hoodie |
| `xmas` | Xmas Sweater |
| `aodai` | Ao Dai |
| `ghost` | Ghost Cloak |
| `windbreak` | Windbreaker |
| `jersey` | Jersey #1 |
| `lion` | Lion Dance Robe |
| `armor` | Dragon Armor |

### `bottom` — Quần

| id | label |
| --- | --- |
| `short` | Shorts |
| `legging` | Leggings |
| `jogger` | Joggers |
| `xmaspants` | Xmas Pants |
| `tetpants` | Tet Silk Pants |
| `tutu` | Tutu Skirt |
| `camo` | Camo Pants |
| `swim` | Swim Trunks |
| `ghostpants` | Spectre Pants |
| `flame` | Flame Pants |

### `shoes` — Giày

| id | label |
| --- | --- |
| `sneaker` | Sneakers |
| `runner` | Running Shoes |
| `boot` | Boots |
| `xmasboot` | Santa Boots |
| `hai` | Tet Slippers |
| `sandal` | Sandals |
| `socks` | Tall Socks |
| `glow` | Glow Kicks |
| `ghostshoe` | Phantom Shoes |
| `wing` | Winged Boots |

### `back` — Sau lưng

| id | label |
| --- | --- |
| `backpack` | Backpack |
| `hydro` | Hydration Pack |
| `angel` | Angel Wings |
| `bat` | Bat Wings |
| `giftbag` | Gift Sack |
| `lixi` | Lucky Money Pouch |
| `cape` | Hero Cape |
| `oxygen` | Oxygen Tank |
| `dragonwing` | Dragon Wings |
| `jetpack` | Jetpack |

### `hand` — Cầm tay

| id | label |
| --- | --- |
| `bottle` | Water Bottle |
| `dumbbell` | Dumbbell |
| `towel` | Gym Towel |
| `rope` | Jump Rope |
| `candy` | Candy Cane |
| `lantern` | Tet Lantern |
| `broom` | Witch Broom |
| `redenv` | Red Envelope |
| `trophy` | Gold Trophy |
| `sparkler` | Sparkler |


Many are seasonal/Vietnamese — Tết (`khanxep`, `aodai`, `tetpants`, `hai`, `lixi`, `lantern`, `redenv`), Christmas (`santa`, `xmas`, `xmasboot`, `giftbag`, `candy`), Halloween (`witch`, `ghost`, `bat`, `broom`, `pumpkin`), lion dance (`lion`) — so the shop will want a season/theme field the current catalogue does not have.
