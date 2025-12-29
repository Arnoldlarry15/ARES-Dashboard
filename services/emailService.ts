// Email Service for sending invites and notifications
// In production, this would integrate with a backend API or email service like SendGrid, AWS SES, etc.

import { UserRole } from '../types/auth';

export interface EmailInvite {
  to: string;
  role: UserRole;
  invitedBy: string;
  inviteLink?: string;
}

export class EmailService {
  /**
   * Send an invite email to a new team member
   * In a production environment, this would call a backend API endpoint
   * that securely sends emails using a service like SendGrid, AWS SES, etc.
   */
  static async sendInvite(invite: EmailInvite): Promise<boolean> {
    try {
      // In demo mode, we simulate sending an email
      // In production, replace this with actual API call:
      // const response = await fetch('/api/invite', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(invite)
      // });
      
      console.log('📧 Sending invite email:', {
        to: invite.to,
        role: invite.role,
        invitedBy: invite.invitedBy,
        subject: 'You\'re invited to join ARES Dashboard',
        body: this.generateInviteEmailBody(invite)
      });

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // In demo mode, we always succeed
      // In production, check response status
      return true;
    } catch (error) {
      console.error('Failed to send invite email:', error);
      return false;
    }
  }

  /**
   * Generate the email body for an invite
   */
  private static generateInviteEmailBody(invite: EmailInvite): string {
    const inviteLink = invite.inviteLink || window.location.origin;
    
    return `
Hi there,

${invite.invitedBy} has invited you to join their team on ARES Dashboard as a ${invite.role}.

ARES Dashboard is an AI Red Teaming & Evaluation System that helps security teams test and improve their AI systems.

Click the link below to accept the invitation and get started:
${inviteLink}

If you have any questions, please don't hesitate to reach out.

Best regards,
The ARES Team
    `.trim();
  }

  /**
   * Send a notification email (for campaign shares, etc.)
   */
  static async sendNotification(to: string, subject: string, body: string): Promise<boolean> {
    try {
      console.log('📧 Sending notification email:', { to, subject, body });
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      return true;
    } catch (error) {
      console.error('Failed to send notification email:', error);
      return false;
    }
  }
}
