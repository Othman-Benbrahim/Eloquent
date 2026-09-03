// SPDX-License-Identifier: GPL-3.0-only

use std::{
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream},
    time::Duration,
};

fn loopback_address(port: u16) -> SocketAddr {
    SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port))
}

pub fn server_is_healthy(port: u16, timeout: Duration) -> bool {
    let Ok(mut stream) = TcpStream::connect_timeout(&loopback_address(port), timeout) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(timeout));
    let _ = stream.set_write_timeout(Some(timeout));
    let request = format!(
        "GET /v2/languages HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = [0_u8; 64];
    let Ok(length) = stream.read(&mut response) else {
        return false;
    };
    let status = String::from_utf8_lossy(&response[..length]);
    status.starts_with("HTTP/1.1 200") || status.starts_with("HTTP/1.0 200")
}

pub fn port_is_available(port: u16) -> bool {
    TcpListener::bind(loopback_address(port)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn health_check_accepts_a_local_http_200_response() {
        let listener = TcpListener::bind(loopback_address(0)).expect("bind test server");
        let port = listener.local_addr().expect("address").port();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().expect("accept");
            let mut request = [0_u8; 256];
            let _ = socket.read(&mut request);
            socket
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n[]")
                .expect("reply");
        });
        assert!(server_is_healthy(port, Duration::from_secs(1)));
        server.join().expect("server thread");
    }

    #[test]
    fn an_unused_loopback_port_is_available() {
        let listener = TcpListener::bind(loopback_address(0)).expect("bind");
        let port = listener.local_addr().expect("address").port();
        drop(listener);
        assert!(port_is_available(port));
    }
}
