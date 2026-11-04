package claudecode

import "io"

type stderrPersistence struct {
	w               io.Writer
	cap, kept, lost int64
}

func (p *stderrPersistence) Write(b []byte) (int, error) {
	n := int(min(int64(len(b)), p.cap-p.kept))
	if n > 0 {
		written, err := p.w.Write(b[:n])
		p.kept += int64(written)
		if err != nil {
			return written, err
		}
	}
	p.lost += int64(len(b) - n)
	return len(b), nil
}

func (r *roundRun) addPersistence(event map[string]any) {
	if r.streamLostLines > 0 {
		event["stream_persist_truncated"] = true
		event["stream_persist_unpersisted_bytes"] = r.streamLostBytes
	}
	if r.stderrLostBytes > 0 {
		event["stderr_persist_truncated"] = true
		event["stderr_persist_unpersisted_bytes"] = r.stderrLostBytes
	}
}
