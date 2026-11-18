pub mod error;
pub mod events;
pub mod ids;
pub mod methods;
pub mod protocol;
pub mod registry;
pub mod values;

/// Bumped only for incompatible changes; the shell refuses a core that answers another version.
pub const PROTOCOL_VERSION: u32 = 1;
