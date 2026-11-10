//! Base64 chuẩn (RFC 4648, có đệm `=`) — cầu đưa byte qua ranh giới JSON.
//!
//! Ba kênh nhập tệp của bước 5/6 gửi byte sang V8 nhúng, mà `__eg_input` là JSON:
//! chuỗi base64 là dạng duy nhất đi qua được. Thư viện `base64` chỉ vì thế mà kéo
//! theo một crate nữa, nên bảng 64 ký tự nằm ngay đây và có test đối chiếu với
//! `Buffer.from(…, 'base64')` của Node — hai bên giải mã cùng một chuỗi ra cùng
//! một tệp, đó là điều duy nhất cần đúng.

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/// Mã hoá byte thành chuỗi base64 có đệm.
pub fn encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(ALPHABET[(triple >> 18) as usize & 63] as char);
        out.push(ALPHABET[(triple >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { ALPHABET[(triple >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { ALPHABET[triple as usize & 63] as char } else { '=' });
    }
    out
}

/// Chân của bảng ngược: giá trị 6 bit của một ký tự, `None` với ký tự lạ.
/// Dựng một lần, dùng cho mọi lượt giải mã.
fn values() -> &'static [u8; 256] {
    static TABLE: std::sync::OnceLock<[u8; 256]> = std::sync::OnceLock::new();
    TABLE.get_or_init(|| {
        let mut table = [0xFFu8; 256];
        for (index, byte) in ALPHABET.iter().enumerate() {
            table[*byte as usize] = index as u8;
        }
        table
    })
}

/// Giải mã base64; khoảng trắng bị bỏ qua, ký tự lạ hoặc độ dài sai là `None`.
///
/// Rust dùng hàm này ở `illustration.rs` để kiểm lại byte ảnh đã lưu (cổng kiểm
/// tra đọc chuỗi ảnh từ WebView), nên nó từ chối thay vì đoán: một chuỗi hỏng mà
/// vẫn ra byte là một tệp ảnh hỏng khó truy.
pub fn decode(text: &str) -> Option<Vec<u8>> {
    let table = values();
    let mut buffer = 0u32;
    let mut bits = 0;
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let mut padding = 0usize;
    for byte in text.bytes() {
        if byte.is_ascii_whitespace() {
            continue;
        }
        if byte == b'=' {
            padding += 1;
            continue;
        }
        if padding > 0 {
            return None;
        }
        let value = table[byte as usize];
        if value == 0xFF {
            return None;
        }
        buffer = (buffer << 6) | value as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    if padding > 2 || bits >= 6 {
        return None;
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_examples_of_the_standard() {
        assert_eq!(encode(b""), "");
        assert_eq!(encode(b"f"), "Zg==");
        assert_eq!(encode(b"fo"), "Zm8=");
        assert_eq!(encode(b"foo"), "Zm9v");
        assert_eq!(encode(b"foob"), "Zm9vYg==");
        assert_eq!(encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn round_trips_every_byte_value() {
        let all: Vec<u8> = (0..=255u8).collect();
        let text = encode(&all);
        assert_eq!(decode(&text), Some(all), "mọi byte phải sống qua một vòng");
        assert_eq!(decode("Zm9v\nYmFy").as_deref(), Some(&b"foobar"[..]), "khoảng trắng bị bỏ qua");
    }

    #[test]
    fn refuses_broken_input() {
        assert_eq!(decode("Zm9vYg==="), None, "đệm thừa");
        assert_eq!(decode("Zm9vYmFy$a"), None, "ký tự lạ");
        assert_eq!(decode("Z"), None, "độ dài không thể là base64");
    }
}
