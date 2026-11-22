import { ChangeDetectionStrategy, Component } from "@angular/core"

@Component({
    selector: "cc-nav-bar-logo",
    templateUrl: "./navBarLogo.component.html",
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: "flex shrink-0" }
})
export class NavBarLogoComponent {}
