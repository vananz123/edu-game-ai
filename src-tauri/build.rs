fn main() {
    // `tauri-plugin-dialog` kéo `rfd`, mà `rfd` gọi `TaskDialogIndirect` của
    // comctl32 v6. Tauri gắn manifest mặc định của nó vào .exe ứng dụng nhưng
    // chỉ qua `rustc-link-arg-bins`, nên test executable (target lib) không có
    // manifest; Windows nạp comctl32 v5 rồi thoát với
    // STATUS_ENTRYPOINT_NOT_FOUND trước khi test đầu tiên chạy.
    //
    // Cách sửa: bảo Tauri sinh resource *không* kèm manifest (icon/version vẫn
    // còn), rồi tự gắn đúng manifest comctl32 v6 ấy cho mọi target. Bản .exe
    // ứng dụng nhận đúng nội dung manifest cũ, không thành hai resource MANIFEST
    // trùng nhau (`CVT1100: duplicate resource`).
    #[cfg(windows)]
    {
        let attributes = tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        tauri_build::try_build(attributes).expect("failed to run tauri-build");

        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg=/MANIFESTINPUT:{}",
            manifest.display()
        );
    }

    #[cfg(not(windows))]
    tauri_build::build();
}
