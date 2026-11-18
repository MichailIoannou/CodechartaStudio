import { Observable } from "rxjs"
import type { DesktopBridge, DesktopEventName, DesktopEventPayload } from "./desktopBridge"

export function observeDesktopEvent<Event extends DesktopEventName>(
    bridge: DesktopBridge,
    event: Event
): Observable<DesktopEventPayload<Event>> {
    return new Observable(subscriber => bridge.subscribe(event, payload => subscriber.next(payload)))
}
