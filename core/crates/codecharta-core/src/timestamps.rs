use std::time::SystemTime;

/// RFC 3339 in UTC to the second, the form every timestamp in the store and on the wire takes.
pub fn now() -> String {
    of(SystemTime::now())
}

pub fn of(time: SystemTime) -> String {
    humantime::format_rfc3339_seconds(time).to_string()
}
