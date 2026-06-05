const DEVICE_ID_KEY = 'handle-device-id';

export interface DeviceInfo {
    deviceId: string;
    deviceType: 'web';
}

function createDeviceId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }

    return `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getDeviceInfo(): DeviceInfo {
    if (typeof window === 'undefined') {
        return { deviceId: 'server', deviceType: 'web' };
    }

    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = createDeviceId();
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    return { deviceId, deviceType: 'web' };
}
