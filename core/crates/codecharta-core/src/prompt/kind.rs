use codecharta_core_api::methods::prompt::PromptKind;

/// ssh's host-key question; the second form is OpenSSH 8.0 and later.
const CONFIRM_ENDINGS: [&str; 2] = ["(yes/no)?", "(yes/no/[fingerprint])?"];
/// git's `Username for 'https://…': `.
const USERNAME_MARKER: &str = "Username";

pub fn classify(message: &str) -> PromptKind {
    let ending = message.trim_end();
    if CONFIRM_ENDINGS
        .iter()
        .any(|confirm| ending.ends_with(confirm))
    {
        PromptKind::Confirm
    } else if message.contains(USERNAME_MARKER) {
        PromptKind::Text
    } else {
        PromptKind::Secret
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_classify_yes_no_as_confirm_username_as_text_else_secret() {
        // Arrange
        let messages = [
            "The authenticity of host '[127.0.0.1]:22222' can't be established.\nED25519 key fingerprint is SHA256:x.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ",
            "Are you sure you want to continue connecting (yes/no)? ",
            "Username for 'https://example.test': ",
            "Password for 'https://ada@example.test': ",
            "Enter passphrase for key '/home/ada/.ssh/id_ed25519': ",
            "ada@example.test's password: ",
        ];

        // Act
        let kinds: Vec<PromptKind> = messages.into_iter().map(classify).collect();

        // Assert
        assert_eq!(
            kinds,
            [
                PromptKind::Confirm,
                PromptKind::Confirm,
                PromptKind::Text,
                PromptKind::Secret,
                PromptKind::Secret,
                PromptKind::Secret,
            ]
        );
    }
}
