use clap::Parser;

#[derive(Debug, Parser)]
#[command(
    name = "codecharta-core",
    version,
    about = "Headless core of the CodeCharta desktop app"
)]
struct Cli {}

fn main() {
    Cli::parse();
}
