#!/usr/bin/env bash
# Sinh font tiếng Việt có dấu cho màn hình Gateway (LVGL 8, 4 bpp, nén RLE): gw_font_vi_16/20/24.c.
# Font Montserrat có sẵn của LVGL chỉ có ASCII — bất biến 10 (UI tiếng Việt) cần bộ font riêng.
#
# Chạy lại khi cần thêm cỡ chữ/ký tự (Git Bash, thư mục bất kỳ):  bash components/ui/fonts/gen_fonts.sh
# Cần Node.js; npx tải lv_font_conv 1.5.2 (công cụ của LVGL) vào cache npm, không cài vào project.
# Font nguồn đi kèm LVGL (components/lvgl__lvgl/scripts/built_in_font/, giấy phép OFL / FontAwesome Free):
#   Montserrat-Medium.ttf               chữ Latin + đủ 134 chữ cái tiếng Việt
#   FontAwesome5-Solid+Brands+Regular   biểu tượng LV_SYMBOL_* mà gw_ui.c dùng
set -euo pipefail
cd "$(dirname "$0")"

SRC=../../lvgl__lvgl/scripts/built_in_font
[ -f "$SRC/Montserrat-Medium.ttf" ] || { echo "Thiếu $SRC — build project 1 lần để component manager tải LVGL"; exit 1; }

# ASCII in được + dấu độ; chữ cái tiếng Việt (hoa + thường, đủ 5 dấu thanh)
LATIN=0x20-0x7E,0xB0
VIET="ĂÂĐÊÔƠƯăâđêôơưÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ"
# LV_SYMBOL_ VIDEO, LIST, OK, HOME, WARNING, UPLOAD, WIFI (lv_symbol_def.h)
SYMBOLS=0xF008,0xF00B,0xF00C,0xF015,0xF071,0xF093,0xF1EB

for size in 16 20 24; do
    npx --yes lv_font_conv@1.5.2 --bpp 4 --size "$size" --format lvgl --lv-include lvgl.h \
        --font "$SRC/Montserrat-Medium.ttf" -r "$LATIN" --symbols "$VIET" \
        --font "$SRC/FontAwesome5-Solid+Brands+Regular.woff" -r "$SYMBOLS" \
        -o "gw_font_vi_$size.c"
    echo "gw_font_vi_$size.c"
done
