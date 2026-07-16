---
title: "Why Infernux Exists"
description: "A non-technical project-origin essay explaining why Infernux chose a C++ core with a Python authoring layer and what the project is trying to become."
category: Musings
tags: ["vision"]
status: stable
since: "0.1.0"
last_verified: "2026-07-15"
audience: ["user", "contributor"]
related_api: []
agent_summary: "A non-technical project-origin essay explaining why Infernux chose a C++ core with a Python authoring layer and what the project is trying to become."
source_paths: ["README.md"]
date: "2026-03-28"
---

# Why Infernux Exists

> Nothing technical here—just a few stories. Along the way, I never found anyone else who wanted to poke at this old, capital‑market‑abandoned thing called a game engine. So I’m writing these thoughts down, hoping that ten years from now they’ll make me smile.

The first time I wanted to build a game engine was in my junior year of college. I was younger then, fresh off Games101. I’d followed HK‑SHAO’s [Taichi: Ray Tracing from Scratch](https://shao.fun/blog/w/taichi-ray-tracing.html) and built a real‑time ray tracer, then a few simple post‑processing effects. I felt like I had the entire foundation of computer graphics in my grip—ready to start my own school. Right around then, Unity announced its runtime fee. The news was everywhere, and I thought: *What if I used Taichi for rendering and parallel computing, built a game engine entirely in Python? I’d make a name for myself. Maybe even stand shoulder to shoulder with the big names.*

That fantasy died a month later when I tried to write a rasterizer from scratch. My rasterizer was slower than the ray tracer I’d just built. Just getting basic face culling to run dragged the whole engine down to around 100 fps. The dream of becoming a graphics god shattered in an instant.

Then came grad school applications. I was at a non‑top‑tier university, and if I wanted to get into a decent graduate program, I needed papers. So I switched gears—3D Gaussian Splatting, generative AI, the whole wave. In the most anxious months, GPT‑3.5 exploded, and suddenly everyone was using it to churn out papers. I jumped onto the LLM bandwagon too.

> It was an era where every paper seemed to be a prompt engineering story. The one I remember most was a top‑conference paper whose main contribution was making an LLM vote on an answer multiple times and picking the majority.

My engine project went cold.

Later, thanks to a mentor’s kindness, a few improbable stories, and a lot of luck, I landed in a good graduate school, still working on LLMs. Then, near the end of 2024, I woke up in the middle of the night in a rented room in a Shenzhen urban village. The green LED on the Midea air conditioner glowed faintly; the fan whirred rhythmically. It felt like one of those stories about enlightenment. My past flashed before me—the excuses I’d made in high school to sneak onto my smartphone, climbing over walls to get to internet cafés, the future of AI, the future of humanity. A surge of joy and gratitude hit me, as if some enlightened monk was whispering in my ear. But I couldn’t make out the words. All I understood was: I don’t want to keep doing large language models anymore. I want to go back to what I truly love.

Not that I was having a religious awakening. It’s just that in the world of LLMs, I couldn’t see the tangible results of my work. `system_message="you are a helpful assistant"`—I was losing myself in abstract narratives. I don’t deny that LLMs are promising, maybe the closest path to AGI. But they just didn’t excite me. So the next morning, I started looking for internships that would let me get back into computer graphics.

I ended up at a company in Shenzhen building embodied‑AI simulation. Their simulation engine was written in C++ at the core, with Python on top—exactly the architecture you see in Infernux today.

Over the next few months, I learned an enormous amount from my colleagues and mentor. How to structure a codebase, how to find and fix bugs, how to build a real‑time ray‑tracing renderer from the ground up. They gave me a lot of freedom; I could pick which issues to work on, and I stayed late gladly.

By the end of the internship, I’d contributed a bunch of pull requests, and I finally understood what a “usable engine” looks like. More importantly, I reopened the engine project I’d abandoned in my junior year and started rebuilding it from scratch, aiming to make it something that could actually be useful. That’s when I settled on the name. “Infernux” came from a conversation with DeepSeek on the subway ride home from work. A mix of *inferno* and *lux*—hellfire and light, in Latin. Self‑deprecating, but also true: the all‑nighters debugging Vulkan barriers, the endless mismatches in physics collisions—it really did feel like walking through hell. Still, a spark can start a prairie fire. Maybe this one could burn down some of those old commercial engines.

And now, a year later, you’re looking at Infernux. For a while I called it InfEngine for short, but a recent arXiv paper used that name for their method, so I had to drop the abbreviation before putting it out there. You might still see “InfEngine” lingering in a few places; I didn’t catch them all.

Whatever the name, version 0.1 is finally here. I’ve grown fond of it, and I hope it catches a few other people’s attention too.
