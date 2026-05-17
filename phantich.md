
"Người dùng upload 1 ảnh poster mẫu (kiểu lịch trình Đà Lạt 4N3Đ) → AI Vision phân tích cấu trúc, layout, màu sắc, typography, vị trí từng phần tử → trả về JSON template chính xác, tái sử dụng được 100% cho việc generate poster mới".

Hãy viết hàm Python hoàn chỉnh, production-ready với tên:

```python
def analyze_poster_to_template(
    image: Union[str, bytes, Image.Image], 
    model: str = "gpt-5.5"
) -> dict

Input: có thể là đường dẫn file ảnh (str), bytes, hoặc PIL Image.
Output: dict Python theo đúng schema JSON bên dưới (phải tuân thủ nghiêm ngặt, không được thêm/bớt field).

Schema JSON Template BẮT BUỘC (phải output đúng 100% cấu trúc này):
JSON{
  "template_id": "string",                    // ví dụ: "dalat_itinerary_4n3d_v1" hoặc "dalat_amenities_v1"
  "template_type": "main_title" | "daily_itinerary" | "amenities",
  "aspect_ratio": "9:16",
  "background": {
    "type": "faded_landscape_with_person_overlay",
    "style": "soft_light_overlay",
    "blur": number,                           // thường 6-10
    "opacity": number                         // thường 0.3-0.45
  },
  "color_palette": {
    "header_bg": "#e74c3c",
    "price_badge": "#f39c12",
    "text_primary": "#2c3e50",
    "text_white": "#ffffff",
    "accent": "#f1c40f"
  },
  "typography": {
    "font_family": "sans-serif_bold",
    "title_size_ratio": 0.085,
    "subtitle_size_ratio": 0.045,
    "price_size_ratio": 0.055,
    "address_size_ratio": 0.038
  },
  "header": {
    "enabled": true,
    "height_ratio": 0.12,
    "style": "rounded_red_bar",
    "text_format": "NGÀY {day} - ${total}" | "CÁC TIỆN ÍCH SẼ CẦN NÊ" | "Đà Lạt GỢI Ý LỊCH TRÌNH 4N3Đ",
    "text_color": "#ffffff",
    "text_align": "center"
  },
  "items": {
    "layout": "vertical_list",
    "item_height_ratio": 0.18,
    "image": {
      "position": "left" | "right",           // xen kẽ tự động
      "size_ratio": 0.28,
      "style": "rounded_corner_12px",
      "border": false
    },
    "text_block": {
      "name_style": "bold",
      "address_style": "regular",
      "spacing": 8
    },
    "price_badge": {
      "style": "rounded_pill",
      "color": "#f39c12",
      "text_color": "#ffffff",
      "padding": "8px 16px"
    }
  },
  "footer": {
    "enabled": false
  },
  "special_variants": {
    "main_title": {
      "header_text": "Đà Lạt\nGỢI Ý LỊCH TRÌNH 4N3Đ",
      "subtitle_format": "/{mô tả ngắn}/"
    },
    "amenities": {
      "header_text": "CÁC TIỆN ÍCH SẼ CẦN NÊ",
      "section_title_color": "#e74c3c",
      "section_title_style": "cursive_red"
    }
  }
}
Dữ liệu tham chiếu (6 ảnh mẫu đã upload trong conversation):

IMG_0812.JPG → Main Title poster (toàn cảnh hồ + text lớn “Đà Lạt GỢI Ý LỊCH TRÌNH 4N3Đ”)
IMG_0813.JPG → Ngày 1
IMG_0814.JPG → Ngày 3
IMG_0815.JPG → Amenities (tiện ích)
IMG_0816.JPG → Ngày 4
IMG_0817.JPG → Ngày 2

Phân tích CHI TIẾT: layout vertical, header đỏ bo góc, background landscape Đà Lạt nhạt + overlay mờ cô gái váy trắng, item có ảnh bo góc bên trái/phải xen kẽ, badge giá cam tròn, font sans-serif bold, v.v.
Yêu cầu code:

Sử dụng OpenAI SDK mới nhất (openai >= 1.40.0).
Gọi gpt-5.5 với Vision (gửi ảnh dưới dạng base64 hoặc URL).
Sử dụng Structured Outputs / JSON mode để đảm bảo output JSON valid 100%.
Kết hợp thêm PIL + OpenCV để hỗ trợ detect color palette, edges, OCR (nếu cần).
Code phải có:
Type hints đầy đủ
Error handling & logging rõ ràng
Comment từng bước (Vision analysis → JSON extraction → validation)
Hàm helper: save_template_to_json(template: dict, path: str) và load_template(path: str)

Code sạch, modular, dễ integrate vào FastAPI endpoint sau này.
```



Đây là apikey gpt

model = gpt-5.5  
base_url = "[https://taskscatt.click/v1](https://taskscatt.click/v1)"  
  
{

  "OPENAI_API_KEY": "sk-611a0eb0478aefd78c612477d2cce869717e2f77c0b55a2cc6352aa9a8c9306b"

}

