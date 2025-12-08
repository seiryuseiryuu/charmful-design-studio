import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  displayName?: string;
  confirmationUrl: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, displayName, confirmationUrl }: EmailRequest = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    console.log(`Sending confirmation email to: ${email}`);

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 100%); border-radius: 16px; padding: 40px; border: 1px solid #333;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); padding: 16px; border-radius: 16px; margin-bottom: 16px;">
              <img src="https://img.icons8.com/color/48/youtube-play.png" alt="YouTube" width="32" height="32" style="display: block;">
            </div>
            <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #ffffff;">
              <span style="color: #8b5cf6;">Thumbnail</span> Generator
            </h1>
          </div>
          
          <h2 style="margin: 0 0 16px; font-size: 20px; text-align: center; color: #ffffff;">
            ${displayName ? `${displayName}さん、` : ''}ようこそ！
          </h2>
          
          <p style="color: #a1a1aa; line-height: 1.6; margin-bottom: 32px; text-align: center;">
            アカウントの作成ありがとうございます。<br>
            以下のボタンをクリックしてメールアドレスを確認してください。
          </p>
          
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${confirmationUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
              メールアドレスを確認
            </a>
          </div>
          
          <p style="color: #71717a; font-size: 12px; text-align: center; line-height: 1.6;">
            このリンクは24時間有効です。<br>
            心当たりがない場合は、このメールを無視してください。
          </p>
          
          <hr style="border: none; border-top: 1px solid #333; margin: 32px 0;">
          
          <p style="color: #52525b; font-size: 11px; text-align: center;">
            ボタンが機能しない場合は、以下のURLをコピーしてブラウザに貼り付けてください：<br>
            <span style="color: #8b5cf6; word-break: break-all;">${confirmationUrl}</span>
          </p>
        </div>
      </body>
      </html>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Thumbnail Generator <onboarding@resend.dev>",
        to: [email],
        subject: "アカウント確認 - Thumbnail Generator",
        html: emailHtml,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error("Resend API error:", data);
      throw new Error(data.message || "Failed to send email");
    }

    console.log("Email sent successfully:", data);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-confirmation-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
