/**
 * The editor's icons: 16px, one family, `currentColor`.
 *
 * A toolbar of glyphs from the font (◀ ◆ ▶) read as placeholders. These were
 * then drawn by hand; they are now the same Phosphor set as the rest of the
 * studio, so the editor's toolbar and the sidebar speak one visual language.
 * The names stay the editor's own, so its code reads the same.
 */

import {
  AlignCenterHorizontalSimple,
  AlignCenterVerticalSimple,
  ArrowCounterClockwise,
  ArrowUUpLeft,
  ArrowUUpRight,
  BookmarkSimple,
  Check as CheckGlyph,
  Copy as CopyGlyph,
  Crop as CropGlyph,
  DeviceMobile,
  DownloadSimple,
  GridFour,
  Image as ImageGlyph,
  Keyboard as KeyboardGlyph,
  MagnifyingGlass,
  Plus as PlusGlyph,
  Sparkle,
  Stack,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextT,
  Trash as TrashGlyph,
  UploadSimple,
  Warning as WarningGlyph,
  X,
  CaretLeft,
  CaretRight,
  type Icon,
} from "@phosphor-icons/react";

const glyph = (Shape: Icon) =>
  function EditorIcon() {
    return <Shape aria-hidden size={16} className="shrink-0" />;
  };

export const Close = glyph(X);
export const ChevronLeft = glyph(CaretLeft);
export const ChevronRight = glyph(CaretRight);
export const Undo = glyph(ArrowUUpLeft);
export const Redo = glyph(ArrowUUpRight);
export const Grid = glyph(GridFour);
export const Phone = glyph(DeviceMobile);
export const Download = glyph(DownloadSimple);
export const Image = glyph(ImageGlyph);
export const Crop = glyph(CropGlyph);
export const Sparkles = glyph(Sparkle);
export const AlignLeft = glyph(TextAlignLeft);
export const AlignCenter = glyph(TextAlignCenter);
export const AlignRight = glyph(TextAlignRight);
/** Centre on the vertical axis: the block slides left or right. */
export const CenterH = glyph(AlignCenterHorizontalSimple);
/** Centre on the horizontal axis: the block slides up or down. */
export const CenterV = glyph(AlignCenterVerticalSimple);
export const Keyboard = glyph(KeyboardGlyph);
export const Check = glyph(CheckGlyph);
export const Warning = glyph(WarningGlyph);
export const Upload = glyph(UploadSimple);
export const Reset = glyph(ArrowCounterClockwise);
export const Copy = glyph(CopyGlyph);
export const Text = glyph(TextT);
export const Search = glyph(MagnifyingGlass);
export const Plus = glyph(PlusGlyph);
export const Trash = glyph(TrashGlyph);
export const Bookmark = glyph(BookmarkSimple);
/** A slide copied as a new one. */
export const Duplicate = glyph(Stack);
