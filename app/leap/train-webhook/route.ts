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
  "8k close up 1990's high school yearbook photo of @subject {model_type}, preppy stylish uniform, professional headshots, photo-realistic, 4k, high-resolution image, studio settings, upper body, preppy outfit, cute uniform, school, yearbook cloth background, studio lighting",
  "8k 1990's high school yearbook photo of @subject {model_type}, sports uniform, professional headshots, photo-realistic, 4k, high-resolution image, studio settings, upper body, prep school, cute uniform, skirt, yearbook cloth background, studio lighting",
  "8k 1990's hip-hop streetwear fashion photo of @subject {model_type}, award winning photography, retro revival, 4k, 90's streetwear, high resolution, photo-realistic, urban setting, Sportswear Chic",
  "8k 1994 West Coast Hip-Hop Fashion photo of man, award winning photography, 90s Nostalgia, detailed face, 4k, 90's streetwear, high resolution, photo-realistic, Sportswear Chic",
  "@subject {model_type} at Hogwarts party, July 1998, detailed face, detailed arms, full body portrait, Polaroid photo",
  "@subject {model_type} at Hogwarts party, January 1998, detailed face, detailed arms, full body portrait, Polaroid photo",
  "8k polaroid photo of @subject {model_type}, a 1970s Bohemian Hippie, long, flowing, hair, feathers in hair, beads, sun-kissed complexion, flowy tie-dye maxi dress, 4k, high-resolution image, layered necklaces, peace symbols, feathers, vintage-photo, colorful pendants, Beaded bracelets and anklets, barefoot, makeshift campsite in background, grassy meadow, hippy commune",
  "8k polaroid photo of @subject {model_type}, a 1970s Bohemian Hippie, long, flowing, hair, flowers, in hear, beads, sun-kissed complexion, fringed suede vest, bell-bottom jeans, 4k, acoustic guitar, high-resolution image, layered necklaces, peace symbols, feathers, vintage-photo, colorful pendants, Beaded bracelets and anklets, barefoot, Haight Street background, vintage school bus, San francisco",
  "8k 1980s horror film style photo of @subject {model_type}, teen sleepaway camp summer camp, person holding homemade weapon, victim in horror film, 1980s fashion, photo-realistic, high-resolution image, studio settings, full body, 1980s fashion, bloody clothes, 1980s retro slasher film person survivor",
  "8k 1980 horror film style photo of @subject {model_type}, teen sleepaway camp summer camp, teenage victim in 1980 slasher film, 1980s fashion, photo-realistic, high-resolution image, studio settings, full body, bloody clothes",
  "8k vintage portrait of @subject {model_type}, teenage victorian vampire, 1800s beautiful vampire with fangs, fangs, victorian era clothing, blood on face and clothes, photo-realistic, vintage portrait, bloody, grainy picture, victorian style curly hair, horror vampire icon, scary vintage victorian vampire",
  "8k vintage portrait of @subject {model_type}, teenage victorian vampire with fangs, 1800s beautiful young vampire with fangs, victorian era clothing, blood on face and clothes, photo-realistic, vintage portrait, bloody, grainy portrait picture, victorian style curly hair, horror vampire icon, scary vintage victorian vampire, bloody fangs, man-eating vampire",
  "8k photo of @subject {model_type}, siren mermaid, beautiful siren, creepy mermaid, long flowing hair, underwater, photo-realistic, high-resolution image, fantasy siren, studio settings, siren tail, creepy dark siren mermaid, evil, moonlight, ethereal, white, black, ghostly",
  "8k photo of @subject {model_type}, scary siren mermaid, siren mythology, horror, flowing hair, underwater, photo-realistic, high-resolution image, fantasy man-eating siren, studio settings, mermaid tail, creepy, dark, evil, ethereal, white, black, ghostly, sharp teeth, creepy moonlight mermaid",
  "8k polaroid of @subject {model_type}, 1990s young grunge rocker, 1990s vintage grunge clothes, rock band, rocker holding rock music instruments, photo-realistic, 4k, high-resolution image, studio settings, polaroid photo, studio lighting, grainy polaroid of 1990s rocker",
  "8k 1990's polaroid of @subject {model_type}, teenage rocker, 1990s grunge clothes, punk rock band, rocker musician holding rock instruments, photo-realistic, 4k, high-resolution image, studio settings, grainy polaroid photo, studio lighting, 1990's polaroid of punk rocker grunge person, rock band"
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
          from: "noreply@klone.images.ai",
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
          numberOfImages: 4,
          height: 512,
          width: 512,
          steps: 50,
          negativePrompt:
            "(deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck",
          modelId: result.id,
          promptStrength: 7.5,
          webhookUrl: `${leapImageWebhookUrl}?user_id=${user.id}&model_id=${result.id}&webhook_secret=${leapWebhookSecret}&model_db_id=${modelUpdated[0]?.id}`,
        });

        console.log({ status, statusText });
      }
    } else {
      // Send Email
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "noreply@klone.images.ai",
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
