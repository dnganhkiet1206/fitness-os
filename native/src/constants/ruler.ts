/**
 * Hình học của chiếc thước, tách khỏi component vẽ nó.
 *
 * ── vì sao hai con số này rời `weight-goal-ruler.tsx` ──
 *
 * `useRulerIndex` cần `TICK_W` để đặt thước vào đúng vạch mở màn. Một hook
 * nhập GIÁ TRỊ từ một component là thứ `tools/layering.mjs` bắt, và nó bắt
 * đúng: hook với tay vào component thường là để chạm tới một hằng mà component
 * ấy chỉ tình cờ đang giữ hộ.
 *
 * Nên hằng về chỗ của hằng. Component vẫn `export` lại hai tên này, vì ba chỗ
 * dùng hiện có đều là component hoặc màn hình và đường nhập cũ của chúng không
 * sai — chỉ có hook là không được đi đường ấy.
 */

/**
 * Points between ticks — how far the finger travels for one tenth of a unit.
 *
 * 4, which puts a whole kilogram 40pt apart and about ten of them on screen.
 * There is a real trade here and it is worth naming: finer values mean more
 * ticks mean more dragging for the same distance travelled, unless the ticks
 * get narrower. At the old half-kilo steps a kilogram was 24pt; a tenth-kilo
 * ruler at the same 12pt tick would have made it 120, which is five times the
 * work to move the same amount. 4pt gets most of that back while leaving the
 * ticks far enough apart to read as separate marks rather than as a smear.
 */
export const TICK_W = 4;

/**
 * Height of the whole ruler strip.
 *
 * Exported because the screen has to size its own container and its needle to
 * match — the two were separate constants that happened to agree, which is a
 * pair of numbers waiting to drift apart.
 */
export const RULER_H = 96;
