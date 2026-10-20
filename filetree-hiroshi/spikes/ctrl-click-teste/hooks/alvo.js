const Alvo = (_props, surface) => {
    const { Box, Text } = surface.elements;
    if (surface.state === undefined) {
        surface.setState({ events: [] });
        surface.onPointer(ev => {
            if (ev.type !== 'down' && ev.type !== 'up')
                return;
            const mods = [ev.ctrl && 'ctrl', ev.shift && 'shift', ev.alt && 'alt'].filter(Boolean).join('+') || 'nenhum';
            const line = `${ev.type} ${ev.button ?? '?'} mods=${mods} x=${ev.x} y=${ev.y}`;
            surface.post({ type: ev.type, button: ev.button ?? null, ctrl: ev.ctrl === true, shift: ev.shift === true, alt: ev.alt === true, x: ev.x, y: ev.y });
            surface.setState({ events: [line, ...(surface.state?.events ?? [])].slice(0, 6) });
        });
    }
    const events = surface.state?.events ?? [];
    return (<Box flexDirection="column" borderStyle="round" flexGrow={1}>
      {events.length === 0 ? <Text dimColor>(nenhum clique ainda)</Text> : events.map(l => <Text>{l}</Text>)}
    </Box>);
};
export default Alvo;
