#[tauri::command]
pub(crate) fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
    platform::read_clipboard_file_paths()
}

#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::ptr::null_mut;

    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows_sys::Win32::UI::Shell::{DragQueryFileW, HDROP};

    const CF_HDROP: u32 = 15;

    struct ClipboardGuard;

    impl Drop for ClipboardGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }

    pub(super) fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
        unsafe {
            if OpenClipboard(null_mut()) == 0 {
                return Ok(Vec::new());
            }
            let _guard = ClipboardGuard;

            if IsClipboardFormatAvailable(CF_HDROP) == 0 {
                return Ok(Vec::new());
            }

            let handle = GetClipboardData(CF_HDROP);
            if handle.is_null() {
                return Ok(Vec::new());
            }

            let hdrop = handle as HDROP;
            let count = DragQueryFileW(hdrop, u32::MAX, null_mut(), 0);
            let mut paths = Vec::with_capacity(count as usize);

            for index in 0..count {
                let len = DragQueryFileW(hdrop, index, null_mut(), 0);
                if len == 0 {
                    continue;
                }
                let mut buffer = vec![0u16; len as usize + 1];
                let copied = DragQueryFileW(hdrop, index, buffer.as_mut_ptr(), buffer.len() as u32);
                if copied == 0 {
                    continue;
                }
                buffer.truncate(copied as usize);
                let path = OsString::from_wide(&buffer).to_string_lossy().to_string();
                if !path.is_empty() {
                    paths.push(path);
                }
            }

            Ok(paths)
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    pub(super) fn read_clipboard_file_paths() -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }
}
