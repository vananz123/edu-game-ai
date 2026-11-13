//! Bí mật của giáo viên trên Windows: DPAPI, không phải plaintext.
//!
//! Electron dùng `safeStorage` để mã hoá API key trước khi ghi `settings.json`.
//! Bản Tauri không được giữ một khoá plaintext ở bất kỳ đâu, nên phần này thay
//! đúng chỗ đó bằng DPAPI của Windows (`CryptProtectData` / `CryptUnprotectData`).
//! Blob DPAPI được base64 và nằm trong `settings.json`; chỉ tiến trình Rust đọc
//! được nó, renderer chỉ thấy `hasKey` + `keyMasked`.
//!
//! Không tự chuyển khoá từ profile Electron, và không còn đường nhập profile nào
//! (Giai đoạn 4 đã bị gỡ): giáo viên nhập lại khoá trên bản Tauri. Nếu
//! không mã hoá được, lời gọi lưu phải HỎNG với mã `AI_KEY_STORAGE_UNAVAILABLE`
//! và cấu hình cũ phải giữ nguyên — không bao giờ ghi plaintext để "cứu" thao tác.

/// Mã lỗi renderer đã biết (xem `features/settings.ts`): khoá mới chưa được lưu.
pub const KEY_STORAGE_UNAVAILABLE: &str = "AI_KEY_STORAGE_UNAVAILABLE";

/// Mã hoá một khoá API thành blob base64 bằng DPAPI của phiên đăng nhập hiện tại.
pub fn protect_secret(plaintext: &str) -> Result<String, String> {
    if plaintext.is_empty() {
        return Err("AI_CONFIG: khoá API rỗng".to_string());
    }
    platform::protect(plaintext.as_bytes())
        .map(|blob| crate::base64::encode(&blob))
        .map_err(|error| format!("{KEY_STORAGE_UNAVAILABLE}: {error}"))
}

/// Giải mã một blob base64 do `protect_secret` tạo ra.
pub fn unprotect_secret(encoded: &str) -> Result<String, String> {
    let blob = crate::base64::decode(encoded)
        .ok_or_else(|| "AI_CONFIG: khoá đã lưu không phải base64 hợp lệ".to_string())?;
    let bytes = platform::unprotect(&blob)
        .map_err(|error| format!("AI_CONFIG: không giải mã được khoá đã lưu ({error})"))?;
    String::from_utf8(bytes)
        .map_err(|_| "AI_CONFIG: khoá đã lưu không phải UTF-8 hợp lệ".to_string())
}

/// Dạng duy nhất của khoá mà renderer được thấy: bốn ký tự cuối.
pub fn mask_secret(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let last: String = plaintext
        .chars()
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("••••{last}")
}

#[cfg(windows)]
mod platform {
    use std::ffi::c_void;

    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    fn blob(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    fn take_output(output: CRYPT_INTEGER_BLOB) -> Result<Vec<u8>, String> {
        if output.pbData.is_null() {
            return Err("DPAPI trả về blob rỗng".to_string());
        }
        // Sao chép ra Vec trước khi trả bộ nhớ cho Windows: `output.pbData` do
        // LocalAlloc cấp và phải được LocalFree, không được để rò rỉ.
        let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
        unsafe {
            LocalFree(output.pbData as *mut c_void);
        }
        Ok(bytes)
    }

    pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(plaintext);
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        take_output(output)
    }

    pub fn unprotect(blob_bytes: &[u8]) -> Result<Vec<u8>, String> {
        let input = blob(blob_bytes);
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        take_output(output)
    }
}

#[cfg(not(windows))]
mod platform {
    pub fn protect(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Err("DPAPI chỉ có trên Windows".to_string())
    }

    pub fn unprotect(_blob: &[u8]) -> Result<Vec<u8>, String> {
        Err("DPAPI chỉ có trên Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{mask_secret, protect_secret, unprotect_secret};

    #[test]
    fn mask_keeps_only_the_last_four_characters() {
        assert_eq!(mask_secret("synthetic-key-1234"), "••••1234");
        assert_eq!(mask_secret("abc"), "••••abc");
        assert_eq!(mask_secret(""), "");
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_round_trip_does_not_contain_plaintext() {
        let plaintext = "synthetic-dpapi-key-9876";
        let encoded = protect_secret(plaintext).expect("DPAPI phải mã hoá được trên Windows");
        assert!(!encoded.contains("synthetic"));
        assert_ne!(encoded, plaintext);
        assert_eq!(unprotect_secret(&encoded).expect("giải mã DPAPI"), plaintext);
    }

    #[test]
    fn corrupt_or_plain_base64_is_rejected() {
        assert!(unprotect_secret("not-base64!").is_err());
        // Base64 hợp lệ nhưng không phải blob DPAPI: phải hỏng, không được trả
        // chuỗi rỗng hay một khoá nào khác.
        assert!(unprotect_secret("QUJD").is_err());
    }
}
