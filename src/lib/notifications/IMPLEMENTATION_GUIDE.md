# Notification System Implementation Guide

## Quick Start

### 1. Import the Notification Service

```typescript
import {
  sendNotification,
  getNotifications,
  markAsRead,
  getUnreadCount,
  setNotificationPreference,
  NotificationType,
  NotificationChannel,
} from '@/lib/notifications';
```

### 2. Send Your First Notification

```typescript
// Send a simple notification
const result = await sendNotification({
  tenantId: 'your-tenant-id',
  userId: 'current-user-id',
  type: NotificationType.CONTACT_CREATED,
  title: 'New Contact Created',
  message: 'A new contact has been added to your CRM',
  channels: [NotificationChannel.IN_APP],
});

if (result.success) {
  console.log('Notification sent!');
}
```

### 3. Retrieve Notifications

```typescript
// Get user's notifications
const notifications = getNotifications(tenantId, userId);

// Display them
notifications.forEach((notif) => {
  console.log(`[${notif.read ? 'READ' : 'UNREAD'}] ${notif.title}`);
});

// Check unread count
const unreadCount = getUnreadCount(tenantId, userId);
console.log(`You have ${unreadCount} unread notifications`);
```

## Common Use Cases

### Contact Management Notifications

```typescript
// When a contact is created
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.CONTACT_CREATED,
  title: 'Contact Added',
  message: `${contact.name} has been added to your contacts`,
  channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  actionUrl: `/contacts/${contact.id}`,
  actionLabel: 'View Contact',
  data: { contactId: contact.id, contactName: contact.name },
  tags: ['contact', 'crm'],
});

// When a contact is updated
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.CONTACT_UPDATED,
  title: 'Contact Updated',
  message: `${contact.name}'s contact information has been updated`,
  channels: [NotificationChannel.IN_APP],
  actionUrl: `/contacts/${contact.id}`,
  data: { contactId: contact.id },
  tags: ['contact', 'update'],
});
```

### Lead Management Notifications

```typescript
// When lead is assigned
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.LEAD_ASSIGNED,
  title: 'Lead Assigned to You',
  message: `You have been assigned to lead: ${lead.name}`,
  channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
  priority: 'high',
  actionUrl: `/leads/${lead.id}`,
  actionLabel: 'View Lead',
  data: { leadId: lead.id, leadName: lead.name, assignedBy: currentUser.id },
  tags: ['lead', 'assignment'],
});

// When lead is qualified
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.LEAD_QUALIFIED,
  title: 'Lead Qualified',
  message: `${lead.name} has been qualified as a sales opportunity`,
  channels: [NotificationChannel.IN_APP],
  priority: 'high',
  data: { leadId: lead.id, qualifiedValue: lead.value },
  tags: ['lead', 'qualified'],
});
```

### System Notifications

```typescript
// System alerts
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.SYSTEM_ALERT,
  title: 'System Alert',
  message: 'High CPU usage detected in your account',
  channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  priority: 'critical',
  tags: ['system', 'alert'],
});

// Maintenance notifications
await sendNotification({
  tenantId,
  userId,
  type: NotificationType.SYSTEM_MAINTENANCE,
  title: 'Scheduled Maintenance',
  message: 'System maintenance scheduled for tonight at 2 AM UTC',
  channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  priority: 'normal',
  tags: ['system', 'maintenance'],
});
```

## Managing User Preferences

### Set Up Default Preferences

```typescript
// Allow user to receive all notifications
const notificationTypes = [
  NotificationType.CONTACT_CREATED,
  NotificationType.CONTACT_UPDATED,
  NotificationType.LEAD_ASSIGNED,
  NotificationType.LEAD_QUALIFIED,
];

notificationTypes.forEach((type) => {
  setNotificationPreference({
    userId,
    tenantId,
    type,
    enabled: true,
    channels: {
      [NotificationChannel.IN_APP]: true,
      [NotificationChannel.EMAIL]: true,
      [NotificationChannel.PUSH]: true,
      [NotificationChannel.SMS]: false,
    },
  });
});
```

### Allow User to Customize Preferences

```typescript
// User disables email notifications for contact updates
setNotificationPreference({
  userId,
  tenantId,
  type: NotificationType.CONTACT_UPDATED,
  enabled: true,
  channels: {
    [NotificationChannel.IN_APP]: true,
    [NotificationChannel.EMAIL]: false, // Disabled
    [NotificationChannel.PUSH]: true,
    [NotificationChannel.SMS]: false,
  },
});

// User disables all notifications for a type
setNotificationPreference({
  userId,
  tenantId,
  type: NotificationType.SYSTEM_MAINTENANCE,
  enabled: false, // All channels disabled
  channels: {
    [NotificationChannel.IN_APP]: false,
    [NotificationChannel.EMAIL]: false,
    [NotificationChannel.PUSH]: false,
    [NotificationChannel.SMS]: false,
  },
});
```

## Building Notification UI Components

### Notification Inbox Component

```typescript
import { useEffect, useState } from 'react';
import { getNotifications, markAsRead, getUnreadCount } from '@/lib/notifications';

export function NotificationInbox({ tenantId, userId }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Load notifications
    const notifs = getNotifications(tenantId, userId, { limit: 20 });
    setNotifications(notifs);
    setUnreadCount(getUnreadCount(tenantId, userId));
  }, [tenantId, userId]);

  const handleMarkAsRead = (notificationId) => {
    markAsRead(tenantId, userId, notificationId);
    // Refresh list
    setNotifications(getNotifications(tenantId, userId));
    setUnreadCount(getUnreadCount(tenantId, userId));
  };

  return (
    <div>
      <h2>Notifications ({unreadCount} unread)</h2>
      <div className="notification-list">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`notification ${notif.read ? 'read' : 'unread'}`}
          >
            <div className="notification-title">{notif.title}</div>
            <div className="notification-message">{notif.message}</div>
            <div className="notification-time">
              {new Date(notif.createdAt).toLocaleString()}
            </div>
            {!notif.read && (
              <button onClick={() => handleMarkAsRead(notif.id)}>
                Mark as Read
              </button>
            )}
            {notif.actionUrl && (
              <a href={notif.actionUrl} className="notification-action">
                {notif.actionLabel || 'View'}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Notification Bell Component

```typescript
import { useEffect, useState } from 'react';
import { getUnreadCount } from '@/lib/notifications';

export function NotificationBell({ tenantId, userId, onClick }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const count = getUnreadCount(tenantId, userId);
    setUnreadCount(count);

    // Poll for updates (or use WebSocket in production)
    const interval = setInterval(() => {
      setUnreadCount(getUnreadCount(tenantId, userId));
    }, 5000);

    return () => clearInterval(interval);
  }, [tenantId, userId]);

  return (
    <button className="notification-bell" onClick={onClick}>
      🔔
      {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
    </button>
  );
}
```

### Notification Preferences Component

```typescript
import { useEffect, useState } from 'react';
import {
  getAllPreferences,
  setNotificationPreference,
  NotificationChannel,
  NotificationType,
} from '@/lib/notifications';

export function NotificationPreferences({ tenantId, userId }) {
  const [preferences, setPreferences] = useState({});

  useEffect(() => {
    const prefs = getAllPreferences(tenantId, userId);
    setPreferences(
      prefs.reduce((acc, pref) => {
        acc[pref.type] = pref;
        return acc;
      }, {})
    );
  }, [tenantId, userId]);

  const handleToggleChannel = (type, channel) => {
    const pref = preferences[type];
    const updated = {
      ...pref,
      channels: {
        ...pref.channels,
        [channel]: !pref.channels[channel],
      },
    };
    setNotificationPreference(updated);
    setPreferences({ ...preferences, [type]: updated });
  };

  const handleToggleType = (type) => {
    const pref = preferences[type];
    const updated = {
      ...pref,
      enabled: !pref.enabled,
    };
    setNotificationPreference(updated);
    setPreferences({ ...preferences, [type]: updated });
  };

  return (
    <div className="notification-preferences">
      <h2>Notification Preferences</h2>
      {Object.entries(preferences).map(([type, pref]: any) => (
        <div key={type} className="preference-item">
          <label>
            <input
              type="checkbox"
              checked={pref.enabled}
              onChange={() => handleToggleType(type)}
            />
            {type}
          </label>
          {pref.enabled && (
            <div className="channels">
              {Object.values(NotificationChannel).map((channel) => (
                <label key={channel}>
                  <input
                    type="checkbox"
                    checked={pref.channels[channel] || false}
                    onChange={() => handleToggleChannel(type, channel)}
                  />
                  {channel}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

## Real-Time Notifications with WebSocket

```typescript
import { useEffect } from 'react';
import { WebSocketNotificationBroadcaster } from '@/lib/notifications/websocket';
import { NotificationType } from '@/lib/notifications';

export function useRealtimeNotifications(tenantId, userId) {
  useEffect(() => {
    const broadcaster = new WebSocketNotificationBroadcaster();

    // Connect to WebSocket
    broadcaster
      .connect('wss://notifications.example.com', { tenantId, userId })
      .then(() => {
        console.log('Connected to notifications');
      });

    // Subscribe to specific notification types
    const unsubscribeLead = broadcaster.subscribe(
      tenantId,
      userId,
      NotificationType.LEAD_ASSIGNED,
      (notification) => {
        console.log('New lead assigned:', notification);
        // Show toast or update UI
      }
    );

    // Cleanup
    return () => {
      unsubscribeLead();
      broadcaster.close();
    };
  }, [tenantId, userId]);
}

// Usage in component
export function MyComponent() {
  useRealtimeNotifications(tenantId, userId);

  return <div>Real-time notifications enabled</div>;
}
```

## Error Handling Best Practices

```typescript
try {
  const result = await sendNotification({
    tenantId,
    userId,
    type: NotificationType.CONTACT_CREATED,
    title: 'New Contact',
    message: 'A new contact was created',
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
  });

  if (!result.success) {
    // Handle failure
    console.error('Notification delivery failed');

    if (result.errors) {
      // Check specific channel failures
      if (!result.channels[NotificationChannel.EMAIL]) {
        console.warn('Email delivery failed:', result.errors[NotificationChannel.EMAIL]);
        // Could retry email later
      }
    }

    // At least in-app should have succeeded
    if (result.channels[NotificationChannel.IN_APP]) {
      console.log('Notification saved locally, email will retry');
    }
  }
} catch (error) {
  console.error('Error sending notification:', error);
  // Handle error
}
```

## Performance Tips

1. **Batch notifications when sending to multiple users**:
   ```typescript
   await sendBatchNotifications([notification1, notification2, notification3]);
   ```

2. **Use pagination for large notification lists**:
   ```typescript
   const page1 = getNotifications(tenantId, userId, { limit: 20, offset: 0 });
   const page2 = getNotifications(tenantId, userId, { limit: 20, offset: 20 });
   ```

3. **Filter by type to reduce data**:
   ```typescript
   const contactNotifs = getNotifications(tenantId, userId, {
     type: NotificationType.CONTACT_CREATED,
   });
   ```

4. **Use tags for categorization**:
   ```typescript
   const urgentNotifs = getNotifications(tenantId, userId, {
     tags: ['urgent'],
   });
   ```

## Testing Notifications

```typescript
import { describe, it, expect } from 'vitest';
import {
  sendNotification,
  getNotifications,
  getUnreadCount,
} from '@/lib/notifications';

describe('Notifications', () => {
  it('should send and retrieve notifications', async () => {
    const result = await sendNotification({
      tenantId: 'test-tenant',
      userId: 'test-user',
      type: NotificationType.CONTACT_CREATED,
      title: 'Test',
      message: 'Test message',
      channels: [NotificationChannel.IN_APP],
    });

    expect(result.success).toBe(true);

    const notifs = getNotifications('test-tenant', 'test-user');
    expect(notifs.length).toBeGreaterThan(0);
    expect(getUnreadCount('test-tenant', 'test-user')).toBeGreaterThan(0);
  });
});
```

---

**Next Steps**:
1. Review the [Notification System Documentation](./README.md)
2. Check the [Test Files](./__tests__) for more examples
3. Explore [WebSocket Integration](./websocket.ts)
4. Review [Type Definitions](./types.ts)
