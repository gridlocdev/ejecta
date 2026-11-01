// A small LittleJS test for Ejecta on Apple TV: no image files, just shapes
// and text, moved with the Siri Remote or a game controller.
'use strict';

let player, playerColor, sparks = [], presses = 0;

function gameInit()
{
    setCameraScale(64);
    setCanvasClearColor(hsl(.62, .4, .12));
    player = vec2();
    playerColor = hsl(.5, .8, .6);
}

function gameUpdate()
{
    // stick on a controller, swipes or the d-pad on the Siri Remote
    const move = gamepadStick(0);
    player = player.add(move.scale(.2));
    player.x = clamp(player.x, -14, 14);
    player.y = clamp(player.y, -7, 7);

    // A on a controller, a click of the Siri Remote's touch surface
    if (gamepadWasPressed(0))
    {
        ++presses;
        playerColor = hsl(rand(), .8, .6);
        zzfx(...[,,537,.02,.02,.22,1,1.59,-6.98,4.97]); // silent until Ejecta has Web Audio
        for (let i = 40; i--;)
            sparks.push({pos: player, vel: randInCircle(.3), life: 1, color: playerColor});
    }

    for (const s of sparks)
    {
        s.pos = s.pos.add(s.vel);
        s.vel = s.vel.scale(.95);
        s.life -= 1/60;
    }
    sparks = sparks.filter(s => s.life > 0);
}

function gameRender()
{
    for (let x = -15; x <= 15; ++x)
        drawRect(vec2(x, 0), vec2(.05, 16), hsl(.62, .3, .2));
    for (let y = -8; y <= 8; ++y)
        drawRect(vec2(0, y), vec2(32, .05), hsl(.62, .3, .2));

    for (const s of sparks)
        drawRect(s.pos, vec2(.25 * s.life), s.color.scale(1, s.life));
    drawCircle(player, 1, playerColor);
}

function gameRenderPost()
{
    const pad = gamepadConnected(0) ? 'Controller connected' : 'Waiting for a remote or controller';
    drawTextScreen('LittleJS on Ejecta', vec2(mainCanvasSize.x/2, 80), 64);
    drawTextScreen(pad, vec2(mainCanvasSize.x/2, 150), 32, hsl(0, 0, .7));
    drawTextScreen(`Presses: ${presses}   FPS: ${averageFPS.toFixed(0)}`,
        vec2(mainCanvasSize.x/2, mainCanvasSize.y - 80), 32, hsl(0, 0, .7));
}

engineInit(gameInit, gameUpdate, undefined, gameRender, gameRenderPost);
