//! URL bookmark parsing for shareable positions
//!
//! URL format: ?x=<world_x>&y=<world_y>&z=<zoom>
//! - x, y: World coordinates (can be negative for infinite grid)
//! - z: Zoom level (scale factor)

use crate::constants::VIEWPORT_KEY;

/// Parsed bookmark from URL
#[derive(Debug, Clone, PartialEq)]
pub struct Bookmark {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}

impl Default for Bookmark {
    fn default() -> Self {
        Bookmark {
            x: 0.0,
            y: 0.0,
            zoom: 1.0,
        }
    }
}

/// Parse bookmark from URL query string
/// Example: "x=1000&y=-500&z=0.5" -> Bookmark { x: 1000.0, y: -500.0, zoom: 0.5 }
pub fn parse_bookmark(query: &str) -> Bookmark {
    let mut bookmark = Bookmark::default();

    for part in query.split('&') {
        let mut kv = part.splitn(2, '=');
        if let (Some(key), Some(value)) = (kv.next(), kv.next()) {
            match key {
                "x" => {
                    if let Ok(v) = value.parse::<f64>() {
                        bookmark.x = v;
                    }
                }
                "y" => {
                    if let Ok(v) = value.parse::<f64>() {
                        bookmark.y = v;
                    }
                }
                "z" => {
                    if let Ok(v) = value.parse::<f64>() {
                        if v > 0.0 {
                            bookmark.zoom = v;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    bookmark
}

/// Generate bookmark URL query string from position
pub fn generate_bookmark(x: f64, y: f64, zoom: f64) -> String {
    format!("x={:.0}&y={:.0}&z={:.2}", x, y, zoom)
}

/// Save viewport position to localStorage
pub fn save_viewport(offset_x: f64, offset_y: f64, scale: f64) {
    if let Some(window) = web_sys::window() {
        if let Ok(Some(storage)) = window.local_storage() {
            let value = format!("{},{},{}", offset_x, offset_y, scale);
            let _ = storage.set_item(VIEWPORT_KEY, &value);
        }
    }
}

/// Load viewport position from localStorage
/// Returns (offset_x, offset_y, scale) or None if not saved
pub fn load_viewport() -> Option<(f64, f64, f64)> {
    let window = web_sys::window()?;
    let storage = window.local_storage().ok()??;
    let value = storage.get_item(VIEWPORT_KEY).ok()??;

    let parts: Vec<&str> = value.split(',').collect();
    if parts.len() != 3 {
        return None;
    }

    let offset_x = parts[0].parse().ok()?;
    let offset_y = parts[1].parse().ok()?;
    let scale = parts[2].parse().ok()?;

    Some((offset_x, offset_y, scale))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty() {
        let bookmark = parse_bookmark("");
        assert_eq!(bookmark, Bookmark::default());
    }

    #[test]
    fn test_parse_positive_coords() {
        let bookmark = parse_bookmark("x=1000&y=2000&z=1.5");
        assert_eq!(bookmark.x, 1000.0);
        assert_eq!(bookmark.y, 2000.0);
        assert_eq!(bookmark.zoom, 1.5);
    }

    #[test]
    fn test_parse_negative_coords() {
        let bookmark = parse_bookmark("x=-5000&y=-10000&z=0.5");
        assert_eq!(bookmark.x, -5000.0);
        assert_eq!(bookmark.y, -10000.0);
        assert_eq!(bookmark.zoom, 0.5);
    }

    #[test]
    fn test_parse_partial() {
        // Only x provided
        let bookmark = parse_bookmark("x=500");
        assert_eq!(bookmark.x, 500.0);
        assert_eq!(bookmark.y, 0.0);
        assert_eq!(bookmark.zoom, 1.0);
    }

    #[test]
    fn test_parse_invalid_values() {
        // Invalid values should be ignored
        let bookmark = parse_bookmark("x=abc&y=100&z=-1");
        assert_eq!(bookmark.x, 0.0); // Invalid, use default
        assert_eq!(bookmark.y, 100.0);
        assert_eq!(bookmark.zoom, 1.0); // Negative zoom invalid, use default
    }

    #[test]
    fn test_parse_large_coords() {
        // Large coordinates for distant regions
        let bookmark = parse_bookmark("x=1000000000&y=-999999999&z=0.1");
        assert_eq!(bookmark.x, 1_000_000_000.0);
        assert_eq!(bookmark.y, -999_999_999.0);
        assert_eq!(bookmark.zoom, 0.1);
    }

    #[test]
    fn test_generate_bookmark() {
        let query = generate_bookmark(1000.0, -500.0, 1.5);
        assert_eq!(query, "x=1000&y=-500&z=1.50");
    }

    #[test]
    fn test_roundtrip() {
        let original = Bookmark {
            x: 12345.0,
            y: -67890.0,
            zoom: 2.0,
        };

        let query = generate_bookmark(original.x, original.y, original.zoom);
        let parsed = parse_bookmark(&query);

        assert_eq!(parsed.x, original.x);
        assert_eq!(parsed.y, original.y);
        assert_eq!(parsed.zoom, original.zoom);
    }
}
