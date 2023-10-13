import { Database } from "@/types/supabase";
import { Leap } from "@leap-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const resendApiKey = process.env.RESEND_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const leapApiKey = process.env.LEAP_API_KEY;
const leapImageWebhookUrl = process.env.LEAP_IMAGE_WEBHOOK_URL;
const leapWebhookSecret = process.env.LEAP_WEBHOOK_SECRET;
const stripeIsConfigured = process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true";

const prompts = [
  "Polaroid of @subject {model_type} at a 1996 high school prom, waist up, emphasize on 90s fashion and skin texture",
  "yearbook photo of @subject {model_type} in a 1990's high school uniform, focus on facial features and clothing details",
  "polaroid of @subject {model_type} as a 1990s young grunge rocker, emphasize on facial, clothing and instrument details, perfect skin texture",
  "photo of @subject {model_type} as a siren mermaid, focus on hair and underwater elements",
  "analog style, closeup head and shoulders portrait of @subject {model_type}, long curly hair, beautiful face, gray eyes, symmetrical features, perfect skin, juicy lips, looking at camera, realistic photo, award winning photography, intricate details, masterpiece, leather couch, orange and teal, dynamic lighting, cinematic filters, effects, retouched, tattoos, tanned skin",
  "80's portrait of @subject {model_type}, 4k, detailed face, blue background, white pearl necklace, fashion model in oversized white clothes, official balmain editorial, dramatic lighting highly detailed, analog photo, overglaze, 80mm Sigma f/1.4 or any ZEISS lens",
  "a vintage-style close-up portrait of @subject {model_type} resembling a classic film star. use soft lighting, black and white, and retro fashion from the 1940s. achieve a timeless and glamorous hollywood look",
  "a full-length portrait of @subject {model_type} dressed in a timeless and elegant evening gown, reminiscent of a 1950s hollywood icon. capture the grace and sophistication of their posture, emphasizing the gown's intricate details and the ambiance of an old-fashioned ballroom. emphasis on face details and skin texture",
  "a waist-up portrait of @subject {model_type} channeling the spirit of the '50s rockabilly culture. capture their vibrant style, featuring a pompadour hairstyle, rolled-up jeans, and a leather jacket adorned with patches. create a dynamic, rebellious attitude.",
  "Recreate in 8k the authoritative time magazine cover style with @subject {model_type} in 8k. use a large-format 4x5 view camera to capture every detail. dress them in attire that reflects a significant event or topic, and create a powerful, thought-provoking editorial image in the iconic style of time magazine's cover stories.",
  "recreate in 8k the iconic vogue cover style with @subject {model_type}. use a medium-format hasselblad camera to capture their stunning beauty. dress them in haute couture fashion, and create a high-fashion, dramatic portrait reminiscent of vogue's timeless editorial photography.",
  "8k capture @subject {model_type} in the spirit of a rolling stone rock star editorial. utilize a vintage canon ae-1 camera for that timeless look. dress them in edgy rock attire, place them in a gritty, urban backdrop, and create a raw and captivating portrait in the style of rolling stone's legendary music photography.",
  "generate a hauntingly beautiful vintage 8k portrait of @subject {model_type} as a vampire in the victorian era. dress them in elaborate victorian attire, with dark, rich fabrics and intricate details. emphasize a mysterious and alluring expression, capturing the timeless elegance of a vampire. use soft, candlelit lighting to enhance the atmospheric and gothic feel of the era. optionally, add subtle supernatural elements like fangs or a hint of otherworldly glow.",
  "generate a mesmerizing 8k image of @subject {model_type} as a mystical enchantress deeply connected to the occult and witchcraft. dress them in elaborate and ethereal witch-inspired attire, adorned with symbols and mystical accessories. emphasize an intense and otherworldly expression, capturing the enigmatic aura of a practitioner of the occult. surround them with an atmosphere of mystery, perhaps using candlelight, mystical symbols, or a hint of magical elements in the background. encourage users to experiment with different expressions that convey a sense of inner power and arcane knowledge.",
  "generate a powerful and stoic 8k portrait of @subject {model_type} as a formidable viking warrior. dress them in authentic viking attire, featuring chainmail, furs, and rugged accessories. emphasize a determined and fearless expression, capturing the essence of a viking's strength and bravery. place them in a rugged nordic landscape, perhaps with a ship or elements that evoke the viking age. apply a touch of weathered and earthy tones to enhance the historical and rugged aesthetic."
];

if (!resendApiKey) {
  console.warn("We detected that the RESEND_API_KEY is missing from your environment variables. The app should still work but email notifications will not be sent. Please add your RESEND_API_KEY to your environment variables if you want to enable email notifications.");
}

if (!supabaseUrl) {
  throw new Error("MISSING NEXT_PUBLIC_SUPABASE_URL!");
}

if (!supabaseServiceRoleKey) {
  throw new Error("MISSING SUPABASE_SERVICE_ROLE_KEY!");
}

if (!leapImageWebhookUrl) {
  throw new Error("MISSING LEAP_IMAGE_WEBHOOK_URL!");
}

if (!leapWebhookSecret) {
  throw new Error("MISSING LEAP_WEBHOOK_SECRET!");
}

export async function POST(request: Request) {
  const incomingData = await request.json();
  const { result } = incomingData;
  const urlObj = new URL(request.url);
  const user_id = urlObj.searchParams.get("user_id");
  const webhook_secret = urlObj.searchParams.get("webhook_secret");
  const model_type = urlObj.searchParams.get("model_type");

  if (!leapApiKey) {
    return NextResponse.json(
      {
        message: "Missing API Key: Add your Leap API Key to generate headshots",
      },
      {
        status: 500,
        statusText:
          "Missing API Key: Add your Leap API Key to generate headshots",
      }
    );
  }

  if (!webhook_secret) {
    return NextResponse.json(
      {},
      { status: 500, statusText: "Malformed URL, no webhook_secret detected!" }
    );
  }

  if (webhook_secret.toLowerCase() !== leapWebhookSecret?.toLowerCase()) {
    return NextResponse.json({}, { status: 401, statusText: "Unauthorized!" });
  }

  if (!user_id) {
    return NextResponse.json(
      {},
      { status: 500, statusText: "Malformed URL, no user_id detected!" }
    );
  }

  const supabase = createClient<Database>(
    supabaseUrl as string,
    supabaseServiceRoleKey as string,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.admin.getUserById(user_id);

  if (error) {
    return NextResponse.json({}, { status: 401, statusText: error.message });
  }

  if (!user) {
    return NextResponse.json(
      {},
      { status: 401, statusText: "User not found!" }
    );
  }

  try {
    if (result.status === "finished") {
      // Send Email
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "noreply@deanstirrat.com",
          to: user?.email ?? "",
          subject: "Your model was successfully trained!",
          html: `<h2>We're writing to notify you that your model training was successful! 1 credit has been used from your account.</h2>`,
        });
      }

      const { data: modelUpdated, error: modelUpdatedError } = await supabase
        .from("models")
        .update({
          status: "finished",
        })
        .eq("modelId", result.id)
        .select();

      if (modelUpdatedError) {
        console.error({ modelUpdatedError });
        return NextResponse.json(
          {
            message: "Something went wrong!",
          },
          { status: 500, statusText: "Something went wrong!" }
        );
      }

      if (!modelUpdated) {
        console.error("No model updated!");
        console.error({ modelUpdated });
      }

      const leap = new Leap({
        accessToken: leapApiKey,
      });

      for (let index = 0; index < prompts.length; index++) {
        const { status, statusText } = await leap.images.generate({
          prompt: prompts[index].replace(
            "{model_type}",
            (model_type as string) ?? ""
          ),
          numberOfImages: 3,
          height: 512,
          width: 512,
          steps: 50,
          negativePrompt:
            "(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck",
          modelId: result.id,
          promptStrength: 10,
          webhookUrl: `${leapImageWebhookUrl}?user_id=${user.id}&model_id=${result.id}&webhook_secret=${leapWebhookSecret}&model_db_id=${modelUpdated[0]?.id}`,
        });

        console.log({ status, statusText });
      }
    } else {
      // Send Email
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "noreply@kdeanstirrat.com",
          to: user?.email ?? "",
          subject: "Your model failed to train!",
          html: `<h2>We're writing to notify you that your model training failed!. Since this failed, you will not be billed for it</h2>`,
        });
      }

      // Update model status to failed.
      await supabase
        .from("models")
        .update({
          status: "failed",
        })
        .eq("modelId", result.id);

      if (stripeIsConfigured) {
        // Refund the user.
        const { data } = await supabase.from("credits").select("*").eq("user_id", user.id).single();
        const credits = data!.credits;

        // We are adding a credit back to the user, since we charged them for the model training earlier. Since it failed we need to refund it.
        const addCredit = credits + 1;
        const { error: updateCreditError } = await supabase
          .from("credits")
          .update({ credits: addCredit })
          .eq("user_id", user.id);

        if (updateCreditError) {
          console.error({ updateCreditError });
          return NextResponse.json(
            {
              message: "Something went wrong!",
            },
            { status: 500, statusText: "Something went wrong!" }
          );
        }

        console.log("Refunded user 1 credit! User Id: ", user.id);
      }
    }
    return NextResponse.json(
      {
        message: "success",
      },
      { status: 200, statusText: "Success" }
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        message: "Something went wrong!",
      },
      { status: 500, statusText: "Something went wrong!" }
    );
  }
}
